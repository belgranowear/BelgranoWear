import { Linking, Platform } from 'react-native';

import Constants, { ExecutionEnvironment } from 'expo-constants';

import Preferences from './Preferences';
import Lang from './Lang';

const CHANNEL_ID = 'departure-reminders';

const REMINDER_LEAD_MS       = 5 * 60 * 1000;
const MIN_SCHEDULE_DELAY_MS  = 5 * 1000;
const EXACT_ALARM_MIN_SDK    = 31;
const EXACT_ALARM_SETTINGS_INTENT = 'android.settings.REQUEST_SCHEDULE_EXACT_ALARM';

export const REMINDER_ACTIONS = {
    OPEN_SETTINGS:        'open-settings',
    EXACT_ALARM_SETTINGS: 'exact-alarm-settings'
};

let Notifications = null;
let notificationHandlerConfigured = false;
let initializePromise = null;
let reminderQueue     = Promise.resolve();
let pendingRoute      = null;
let lastHandledResponseId = null;

const routeRequestListeners = new Set();

const isAndroidExpoGo = () => (
    Platform.OS === 'android'
    &&
    (
        Constants.executionEnvironment === ExecutionEnvironment.StoreClient
        ||
        Constants.appOwnership === 'expo'
    )
);

const supportsNativeNotifications = () => Platform.OS !== 'web' && !isAndroidExpoGo();

const loadNotifications = async () => {
    if (!supportsNativeNotifications()) { return null; }

    if (!Notifications) {
        Notifications = await import('expo-notifications');
    }

    if (!notificationHandlerConfigured) {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldPlaySound: true,
                shouldSetBadge: false,
                shouldShowBanner: true,
                shouldShowList: true
            })
        });

        notificationHandlerConfigured = true;
    }

    return Notifications;
};

// Runs reminder operations one at a time so overlapping taps can't schedule duplicate notifications.
const withReminderLock = task => {
    const next = reminderQueue.catch(() => {}).then(task);

    reminderQueue = next.catch(() => {});

    return next;
};

const buildResult = (ok, reason, messageKey, shortMessageKey, extra = {}) => ({
    ok,
    reason,
    message:      Lang.t(messageKey),
    shortMessage: Lang.t(shortMessageKey || messageKey),
    ...extra
});

const tooSoonResult     = () => buildResult(false, 'too-soon', 'reminderUnavailableMessage', 'reminderUnavailableShortMessage');
const unsupportedResult = () => buildResult(false, 'unsupported', 'reminderPlatformUnsupportedMessage', 'reminderPlatformUnsupportedShortMessage');
const failedResult      = () => buildResult(false, 'failed', 'reminderSchedulingFailedMessage', 'reminderSchedulingFailedShortMessage');

// Absolute time (ms) a one-off reminder fires: an explicit fireAt wins, else departure minus leadMinutes (default 5).
const resolveFireAt = (departureAt, { fireAt, leadMinutes } = {}) => {
    const explicit = fireAt != null ? Number(fireAt.valueOf()) : NaN;

    if (Number.isFinite(explicit)) { return Math.min(explicit, departureAt); }

    const leadMs = Number.isFinite(Number(leadMinutes)) && Number(leadMinutes) >= 0
        ? Number(leadMinutes) * 60 * 1000
        : REMINDER_LEAD_MS;

    return departureAt - leadMs;
};

const isTooSoon = fireAtMs => fireAtMs <= Date.now() + MIN_SCHEDULE_DELAY_MS;

// Resolves to 'granted', 'denied' (can ask again) or 'blocked' (only fixable from the system settings).
const ensureNotificationPermissions = async (notifications, requestPermissions) => {
    if (Platform.OS === 'android') {
        await notifications.setNotificationChannelAsync(CHANNEL_ID, {
            name: Lang.t('notificationChannelName'),
            importance: notifications.AndroidImportance.HIGH,
            vibrationPattern: [ 0, 250, 125, 250 ],
            lightColor: '#be4936'
        });
    }

    let permissions = await notifications.getPermissionsAsync();

    if (!permissions.granted && permissions.canAskAgain !== false && requestPermissions) {
        permissions = await notifications.requestPermissionsAsync({
            ios: {
                allowAlert: true,
                allowBadge: false,
                allowSound: true
            }
        });
    }

    if (!permissions.granted) {
        return permissions.canAskAgain === false ? 'blocked' : 'denied';
    }

    if (Platform.OS === 'android') {
        const channel = await notifications.getNotificationChannelAsync(CHANNEL_ID).catch(() => null);

        if (channel && channel.importance === notifications.AndroidImportance.NONE) { return 'blocked'; }
    }

    return 'granted';
};

// Android 12+ may deliver the reminder late unless "Alarms & reminders" is allowed, which can't be queried from JS.
const consumeExactAlarmHint = async () => {
    if (Platform.OS !== 'android' || Platform.Version < EXACT_ALARM_MIN_SDK) { return false; }
    if (await Preferences.getExactAlarmHintShown()) { return false; }

    await Preferences.setExactAlarmHintShown();

    return true;
};

const cancelNotification = async (notifications, identifier) => {
    if (!notifications || !identifier) { return; }

    await notifications.cancelScheduledNotificationAsync(identifier).catch(exception => {
        console.warn('Reminders: failed to cancel scheduled notification:', exception);
    });
};

// Maps notification ids still pending in the OS to their departure time, or null if that can't be known.
const getScheduledDepartures = async () => {
    try {
        const notifications = await loadNotifications();

        if (!notifications) { return null; }

        const requests = await notifications.getAllScheduledNotificationsAsync();

        return new Map(requests.map(request => [
            request.identifier,
            Date.parse(request.content?.data?.departureTime)
        ]));
    } catch (exception) {
        console.warn('Reminders: couldn\'t list scheduled notifications:', exception);
    }

    return null;
};

const buildReminderBody = (origin, destination, departureTime) => Lang.t('reminderAlertBody')
    .replace('%s', origin.title)
    .replace('%s', destination.title)
    .replace('%s', departureTime.format('HH:mm'));

const flushPendingRoute = () => {
    if (!pendingRoute || routeRequestListeners.size === 0) { return; }

    const route = pendingRoute;
    pendingRoute = null;

    routeRequestListeners.forEach(listener => {
        try {
            listener(route);
        } catch (exception) {
            console.warn('Reminders: route request listener failed:', exception);
        }
    });
};

const handleNotificationResponse = response => {
    const request = response?.notification?.request;
    const data    = request?.content?.data || {};

    if (!request || !data.originId || !data.destinationId) { return; }
    if (Notifications && response.actionIdentifier && response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) { return; }
    if (request.identifier === lastHandledResponseId) { return; }

    lastHandledResponseId = request.identifier;
    pendingRoute          = { originId: String(data.originId), destinationId: String(data.destinationId) };

    flushPendingRoute();
};

// --- F5 weekly reminders ---

const MINUTES_PER_DAY = 24 * 60;

const parseClock = time => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));

    return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
};

// App weekdays are 1=Mon…7=Sun; expo-notifications' weekly trigger uses 1=Sun…7=Sat.
const toExpoWeekday = weekday => (weekday % 7) + 1;

// One trigger per chosen weekday at (time - leadMinutes), moving to the previous day when that crosses midnight.
export const computeWeeklyTriggers = ({ weekdays, time, leadMinutes }) => {
    const clock = parseClock(time);

    if (!clock || !Array.isArray(weekdays)) { return []; }

    let totalMinutes = (clock.hour * 60) + clock.minute - (Number(leadMinutes) || 0);
    let dayShift     = 0;

    while (totalMinutes < 0) {
        totalMinutes += MINUTES_PER_DAY;
        dayShift--;
    }

    const days = [ ...new Set(weekdays.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7)) ];

    return days.map(weekday => {
        const shiftedWeekday = ((((weekday - 1 + dayShift) % 7) + 7) % 7) + 1;

        return {
            weekday:     shiftedWeekday,
            expoWeekday: toExpoWeekday(shiftedWeekday),
            hour:        Math.floor(totalMinutes / 60),
            minute:      totalMinutes % 60
        };
    });
};

const createWeeklyId = () => `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const buildWeeklyReminderBody = reminder => Lang.t('reminderAlertBody')
    .replace('%s', reminder.origin.title)
    .replace('%s', reminder.destination.title)
    .replace('%s', reminder.time);

const cancelNotifications = async (notifications, identifiers) => {
    if (!notifications || !Array.isArray(identifiers)) { return; }

    for (const identifier of identifiers) {
        await cancelNotification(notifications, identifier);
    }
};

const isValidWeeklyInput = value => Boolean(
    value
    && value.origin?.id != null
    && value.destination?.id != null
    && String(value.origin.id) !== String(value.destination.id)
    && parseClock(value.time)
    && Array.isArray(value.weekdays)
    && value.weekdays.length > 0
);

// Schedules (or unschedules, when disabled) a weekly reminder and persists its definition.
// Callers must hold the reminder lock. The definition is always saved when valid, even if the
// OS can't deliver notifications, so the list survives and can be re-enabled later.
const applyWeeklyReminder = async (value, { requestPermissions = true } = {}) => {
    if (!isValidWeeklyInput(value)) {
        return buildResult(false, 'invalid', 'weeklyReminderInvalidMessage', 'weeklyReminderInvalidMessage');
    }

    const id       = value.id || createWeeklyId();
    const existing = await Preferences.getWeeklyReminder(id);
    const enabled  = value.enabled !== false;
    const base     = {
        id,
        origin:      { id: String(value.origin.id),      title: value.origin.title      },
        destination: { id: String(value.destination.id), title: value.destination.title },
        weekdays:    value.weekdays,
        time:        value.time,
        leadMinutes: value.leadMinutes,
        enabled
    };

    const persist = async (patch, result) => {
        const reminder = await Preferences.saveWeeklyReminder({ ...base, ...patch });

        if (!reminder) { return failedResult(); }

        return { ...result, reminder };
    };

    const notifications = supportsNativeNotifications() ? await loadNotifications().catch(() => null) : null;

    if (existing?.notificationIds?.length) { await cancelNotifications(notifications, existing.notificationIds); }

    if (!enabled) {
        return persist({ notificationIds: [] }, buildResult(true, 'disabled', 'weeklyReminderDisabledMessage'));
    }

    if (!notifications) {
        return persist({ notificationIds: [] }, buildResult(false, 'unsupported', 'weeklyReminderUnsupportedMessage', 'reminderPlatformUnsupportedShortMessage', { saved: true }));
    }

    try {
        const permission = await ensureNotificationPermissions(notifications, requestPermissions);

        if (permission === 'blocked') {
            return persist({ enabled: false, notificationIds: [] }, buildResult(false, 'blocked', 'notificationPermissionBlockedMessage', 'notificationPermissionBlockedShortMessage', {
                action: REMINDER_ACTIONS.OPEN_SETTINGS,
                saved:  true
            }));
        }

        if (permission !== 'granted') {
            return persist({ enabled: false, notificationIds: [] }, buildResult(false, 'denied', 'notificationPermissionDeniedMessage', 'notificationPermissionDeniedShortMessage', { saved: true }));
        }

        const triggers        = computeWeeklyTriggers(base);
        const notificationIds = [];

        try {
            for (const trigger of triggers) {
                notificationIds.push(await notifications.scheduleNotificationAsync({
                    content: {
                        title: Lang.t('reminderAlertTitle'),
                        body:  buildWeeklyReminderBody(base),
                        data:  {
                            originId:         base.origin.id,
                            destinationId:    base.destination.id,
                            weeklyReminderId: id,
                            departureClock:   base.time
                        }
                    },
                    trigger: {
                        type:      notifications.SchedulableTriggerInputTypes.WEEKLY,
                        weekday:   trigger.expoWeekday,
                        hour:      trigger.hour,
                        minute:    trigger.minute,
                        channelId: CHANNEL_ID
                    }
                }));
            }
        } catch (exception) {
            await cancelNotifications(notifications, notificationIds);

            throw exception;
        }

        const hint = await consumeExactAlarmHint();

        return persist({ notificationIds }, hint
            ? buildResult(true, 'set', 'reminderExactAlarmHintMessage', 'reminderExactAlarmHintShortMessage', { action: REMINDER_ACTIONS.EXACT_ALARM_SETTINGS })
            : buildResult(true, 'set', 'weeklyReminderSavedMessage', 'reminderSetShortMessage'));
    } catch (exception) {
        console.warn('Reminders: couldn\'t schedule weekly reminder:', exception);

        return persist({ enabled: false, notificationIds: [] }, { ...failedResult(), saved: true });
    }
};

const sortWeeklyReminders = reminders => [ ...reminders ].sort((left, right) => (
    left.time.localeCompare(right.time)
    || left.origin.title.localeCompare(right.origin.title)
    || left.createdAt - right.createdAt
));

const Reminders = {
    // Registers the foreground handler and tap routing at startup (native only), including the tap that cold-started the app.
    initialize: () => {
        if (initializePromise || !supportsNativeNotifications()) { return initializePromise; }

        initializePromise = (async () => {
            try {
                const notifications = await loadNotifications();

                if (!notifications) { return; }

                notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

                const lastResponse = await notifications.getLastNotificationResponseAsync();

                if (lastResponse) {
                    handleNotificationResponse(lastResponse);
                    await notifications.clearLastNotificationResponseAsync().catch(() => {});
                }
            } catch (exception) {
                console.warn('Reminders: couldn\'t initialize notifications:', exception);
            }
        })();

        return initializePromise;
    },

    // listener({ originId, destinationId }) is called when a reminder notification is tapped; returns an unsubscribe function.
    onRouteRequested: listener => {
        routeRequestListeners.add(listener);
        flushPendingRoute();

        return () => { routeRequestListeners.delete(listener); };
    },

    // Returns the trip's reminder as { id, departureAt } if it's still pending, cleaning up stale entries on the way.
    getActiveReminder: ({ origin, destination }) => withReminderLock(async () => {
        const scheduled = await getScheduledDepartures();
        const now       = Date.now();

        await Preferences.pruneReminders(reminder => {
            if (reminder.departureAt !== null && reminder.departureAt <= now) { return true; }
            if (scheduled) { return !scheduled.has(reminder.id); }

            return !supportsNativeNotifications();
        });

        const reminder = await Preferences.getReminder(origin, destination);

        if (!reminder) { return null; }

        const departureAt = reminder.departureAt ?? (scheduled ? scheduled.get(reminder.id) : NaN);

        return { id: reminder.id, departureAt: Number.isFinite(departureAt) ? departureAt : null };
    }),

    // Optional `fireAt` (Date/moment/ms) or `leadMinutes` override the default "5 min before departure" alert time.
    scheduleDepartureReminder: ({ origin, destination, departureTime, requestPermissions = true, fireAt, leadMinutes }) => withReminderLock(async () => {
        const departureAt = departureTime.valueOf();
        const fireAtMs    = resolveFireAt(departureAt, { fireAt, leadMinutes });

        if (isTooSoon(fireAtMs)) { return tooSoonResult(); }

        try {
            const notifications = await loadNotifications();

            if (!notifications) { return unsupportedResult(); }

            const permission = await ensureNotificationPermissions(notifications, requestPermissions);

            if (permission === 'blocked') {
                return buildResult(false, 'blocked', 'notificationPermissionBlockedMessage', 'notificationPermissionBlockedShortMessage', {
                    action: REMINDER_ACTIONS.OPEN_SETTINGS
                });
            }

            if (permission !== 'granted') {
                return buildResult(false, 'denied', 'notificationPermissionDeniedMessage', 'notificationPermissionDeniedShortMessage');
            }

            // Checked again after the permission prompts, since time spent in them must not shift the reminder.
            if (isTooSoon(fireAtMs)) { return tooSoonResult(); }

            const existing = await Preferences.getReminder(origin, destination);

            if (existing) { await cancelNotification(notifications, existing.id); }

            const identifier = await notifications.scheduleNotificationAsync({
                content: {
                    title: Lang.t('reminderAlertTitle'),
                    body:  buildReminderBody(origin, destination, departureTime),
                    data:  {
                        originId:      origin.id,
                        destinationId: destination.id,
                        departureTime: departureTime.toISOString()
                    }
                },
                trigger: {
                    type: notifications.SchedulableTriggerInputTypes.DATE,
                    date: fireAtMs,
                    channelId: CHANNEL_ID
                }
            });

            await Preferences.setReminder(origin, destination, { id: identifier, departureAt });

            if (await consumeExactAlarmHint()) {
                return buildResult(true, 'set', 'reminderExactAlarmHintMessage', 'reminderExactAlarmHintShortMessage', {
                    identifier,
                    departureAt,
                    action: REMINDER_ACTIONS.EXACT_ALARM_SETTINGS
                });
            }

            return buildResult(true, 'set', 'reminderSetMessage', 'reminderSetShortMessage', { identifier, departureAt });
        } catch (exception) {
            console.warn('Reminders: couldn\'t schedule notification:', exception);

            return failedResult();
        }
    }),

    cancelDepartureReminder: ({ origin, destination }) => withReminderLock(async () => {
        try {
            const existing      = await Preferences.getReminder(origin, destination);
            const notifications = existing ? await loadNotifications() : null;

            if (existing) { await cancelNotification(notifications, existing.id); }

            await Preferences.removeReminder(origin, destination);

            return buildResult(true, 'canceled', 'reminderCanceledMessage');
        } catch (exception) {
            console.warn('Reminders: failed to cancel reminder:', exception);

            await Preferences.removeReminder(origin, destination);

            return buildResult(false, 'failed', 'reminderCanceledMessage');
        }
    }),

    // --- F5 weekly reminders. Definitions: { id, origin, destination, weekdays (1=Mon…7=Sun), time 'HH:mm', leadMinutes, enabled, notificationIds }.

    isWeeklySupported: () => supportsNativeNotifications(),

    listWeekly: async () => sortWeeklyReminders(await Preferences.getWeeklyReminders()),

    // Creates or replaces (when id is given) a weekly reminder. Resolves to a result like scheduleDepartureReminder's,
    // plus `reminder` (the stored definition) and `saved` when the definition was kept despite a scheduling problem.
    scheduleWeekly: ({ requestPermissions = true, ...value }) => withReminderLock(() => applyWeeklyReminder(value, { requestPermissions })),

    cancelWeekly: id => withReminderLock(async () => {
        try {
            const existing = await Preferences.getWeeklyReminder(id);

            if (existing?.notificationIds?.length) {
                await cancelNotifications(await loadNotifications().catch(() => null), existing.notificationIds);
            }
        } catch (exception) {
            console.warn('Reminders: failed to cancel weekly reminder:', exception);
        }

        await Preferences.removeWeeklyReminder(id);

        return buildResult(true, 'canceled', 'weeklyReminderDeletedMessage');
    }),

    setWeeklyEnabled: (id, enabled, { requestPermissions = true } = {}) => withReminderLock(async () => {
        const existing = await Preferences.getWeeklyReminder(id);

        if (!existing) { return buildResult(false, 'missing', 'weeklyReminderInvalidMessage'); }

        return applyWeeklyReminder({ ...existing, enabled: Boolean(enabled) }, { requestPermissions });
    }),

    // Re-schedules enabled reminders whose OS notifications went missing (app data restore, OS cleanup). Never prompts.
    syncWeekly: () => withReminderLock(async () => {
        if (!supportsNativeNotifications()) { return; }

        try {
            const notifications = await loadNotifications();

            if (!notifications) { return; }

            const scheduled = new Set((await notifications.getAllScheduledNotificationsAsync()).map(request => request.identifier));
            const reminders = await Preferences.getWeeklyReminders();

            for (const reminder of reminders) {
                if (!reminder.enabled) { continue; }

                const expected = computeWeeklyTriggers(reminder).length;
                const missing  = reminder.notificationIds.length !== expected || reminder.notificationIds.some(identifier => !scheduled.has(identifier));

                if (missing) { await applyWeeklyReminder(reminder, { requestPermissions: false }); }
            }
        } catch (exception) {
            console.warn('Reminders: couldn\'t sync weekly reminders:', exception);
        }
    }),

    openSettings: async action => {
        if (action === REMINDER_ACTIONS.EXACT_ALARM_SETTINGS && Platform.OS === 'android' && Linking.sendIntent) {
            try {
                await Linking.sendIntent(EXACT_ALARM_SETTINGS_INTENT);
                return;
            } catch (exception) {
                console.warn('Reminders: couldn\'t open the exact alarm settings:', exception);
            }
        }

        try {
            await Linking.openSettings();
        } catch (exception) {
            console.warn('Reminders: couldn\'t open the app settings:', exception);
        }
    }
};

export default Reminders;

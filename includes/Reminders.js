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

const isTooSoon = departureAt => departureAt - REMINDER_LEAD_MS <= Date.now() + MIN_SCHEDULE_DELAY_MS;

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

    scheduleDepartureReminder: ({ origin, destination, departureTime, requestPermissions = true }) => withReminderLock(async () => {
        const departureAt = departureTime.valueOf();

        if (isTooSoon(departureAt)) { return tooSoonResult(); }

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
            if (isTooSoon(departureAt)) { return tooSoonResult(); }

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
                    date: departureAt - REMINDER_LEAD_MS,
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

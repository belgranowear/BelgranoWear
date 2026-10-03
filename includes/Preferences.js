import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'belgranowear.preferences.';
const THEME_MODE_KEY = `${KEY_PREFIX}themeMode`;
const FAVORITES_KEY  = `${KEY_PREFIX}favoriteTrips`;
const RECENTS_KEY    = `${KEY_PREFIX}recentTrips`;
const REMINDERS_KEY  = `${KEY_PREFIX}reminderNotificationIds`;
const SCHEDULE_SCROLL_HINT_FULL_SCROLL_COUNT_KEY = `${KEY_PREFIX}scheduleScrollHintFullScrollCount`;
const WEEKLY_REMINDERS_KEY   = `${KEY_PREFIX}weeklyReminders`;
const TRIP_USAGE_KEY         = `${KEY_PREFIX}tripUsage`;
const ROUTINE_DISMISSED_KEY  = `${KEY_PREFIX}routineSuggestionDismissed`;

const VALID_THEME_MODES = [ 'system', 'light', 'dark' ];
const MAX_RECENT_TRIPS  = 5;
const MAX_RECENT_TRIPS_TOTAL = 25;
const MAX_SCHEDULE_SCROLL_HINT_FULL_SCROLL_COUNT = 3;
const MAX_TRIP_USAGE_ENTRIES   = 25;
const MAX_TRIP_USAGE_SLOTS     = 12;
const TRIP_USAGE_SLOT_MINUTES  = 5;
const VALID_LEAD_MINUTES       = [ 5, 10, 15 ];
const DEFAULT_LEAD_MINUTES     = 10;
const TIME_PATTERN             = /^([01]\d|2[0-3]):([0-5]\d)$/;

const readJSON = async (key, fallback) => {
    try {
        const rawValue = await AsyncStorage.getItem(key);

        if (rawValue === null) { return fallback; }

        return JSON.parse(rawValue);
    } catch (exception) {
        console.warn(`Preferences: couldn't read ${key}:`, exception);
    }

    return fallback;
};

const writeJSON = async (key, value) => {
    try {
        await AsyncStorage.setItem(key, JSON.stringify(value));

        return true;
    } catch (exception) {
        console.warn(`Preferences: couldn't write ${key}:`, exception);
    }

    return false;
};

const keyLocks = {};

// Serializes read-modify-write cycles per storage key so concurrent updates can't drop each other.
const withKeyLock = (key, task) => {
    const previous = keyLocks[key] || Promise.resolve();
    const next     = previous.catch(() => {}).then(task);

    keyLocks[key] = next.catch(() => {});

    return next;
};

const normalizeTrip = (origin, destination) => ({
    id:          `${origin.id}:${destination.id}`,
    origin:      { id: origin.id,      title: origin.title      },
    destination: { id: destination.id, title: destination.title },
    updatedAt:   Date.now()
});

const writeJSONStrict = async (key, value) => {
    if (!await writeJSON(key, value)) {
        throw new Error(`Preferences: couldn't write ${key}`);
    }
};

const isValidTrip = trip => trip?.origin?.id != null && trip?.destination?.id != null;

const sanitizeTrips = trips => Array.isArray(trips) ? trips.filter(isValidTrip) : [];

// Storage errors are thrown, but a corrupt (unparseable or non-list) value is backed up and replaced
// so the user can keep saving trips instead of being locked out forever.
const readTripsStrict = async key => {
    const rawValue = await AsyncStorage.getItem(key);

    if (rawValue === null) { return []; }

    let trips;

    try {
        trips = JSON.parse(rawValue);
    } catch (exception) {
        trips = undefined;
    }

    if (!Array.isArray(trips)) {
        console.warn(`Preferences: ${key} is corrupt, backing it up and starting over.`);
        await writeJSONStrict(`${key}.corrupt`, rawValue);

        return [];
    }

    return trips.filter(isValidTrip);
};

const normalizeStationTitle = title => String(title || '').trim().replace(/\s+/g, ' ').toLowerCase();

const isSameTrip = (left, right) => {
    if (`${left.origin.id}:${left.destination.id}` === `${right.origin.id}:${right.destination.id}`) { return true; }

    const leftOriginTitle      = normalizeStationTitle(left.origin.title);
    const leftDestinationTitle = normalizeStationTitle(left.destination.title);

    return Boolean(leftOriginTitle && leftDestinationTitle)
        && leftOriginTitle      === normalizeStationTitle(right.origin.title)
        && leftDestinationTitle === normalizeStationTitle(right.destination.title);
};

// Station ids are upstream numeric keys; if a stored id now points to a differently named station, prefer the stored name.
const resolveStation = (storedStation, stations) => {
    const storedTitle = normalizeStationTitle(storedStation.title);
    const byId        = stations.find(station => station.id === storedStation.id);

    if (byId && (!storedTitle || normalizeStationTitle(byId.title) === storedTitle)) { return byId; }

    const byTitle = storedTitle
        ? stations.find(station => normalizeStationTitle(station.title) === storedTitle)
        : undefined;

    return byTitle || byId || null;
};

const pad2 = value => String(value).padStart(2, '0');

const toStation = station => ({ id: String(station.id), title: String(station.title || '') });

// Weekly reminder definition (F5): weekdays use 1=Mon…7=Sun, time is the train's 'HH:mm'.
const normalizeWeeklyReminder = value => {
    if (!value || typeof(value) !== 'object' || typeof(value.id) !== 'string' || value.id.length === 0) { return null; }
    if (!isValidTrip(value) || !TIME_PATTERN.test(String(value.time))) { return null; }

    const weekdays = Array.isArray(value.weekdays)
        ? [ ...new Set(value.weekdays.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7)) ].sort()
        : [];

    if (weekdays.length === 0) { return null; }

    return {
        id:              value.id,
        origin:          toStation(value.origin),
        destination:     toStation(value.destination),
        weekdays,
        time:            value.time,
        leadMinutes:     VALID_LEAD_MINUTES.indexOf(Number(value.leadMinutes)) > -1 ? Number(value.leadMinutes) : DEFAULT_LEAD_MINUTES,
        enabled:         value.enabled !== false,
        notificationIds: Array.isArray(value.notificationIds) ? value.notificationIds.filter(id => typeof(id) === 'string' && id.length > 0) : [],
        createdAt:       Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
        updatedAt:       Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now()
    };
};

const readWeeklyReminders = async () => {
    const reminders = await readJSON(WEEKLY_REMINDERS_KEY, []);

    return Array.isArray(reminders) ? reminders.map(normalizeWeeklyReminder).filter(Boolean) : [];
};

// Usage stats per trip id: { count, weekdayCount, weekendCount, slots: { 'HH:mm': count }, lastUsedAt }.
const readTripUsage = async () => {
    const usage = await readJSON(TRIP_USAGE_KEY, {});

    return usage && typeof(usage) === 'object' && !Array.isArray(usage) ? usage : {};
};

const toUsageSlot = date => {
    const minutes = Math.round(((date.getHours() * 60) + date.getMinutes()) / TRIP_USAGE_SLOT_MINUTES) * TRIP_USAGE_SLOT_MINUTES;
    const clamped = Math.min(minutes, (24 * 60) - TRIP_USAGE_SLOT_MINUTES);

    return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
};

const recordTripUsage = async (origin, destination, date = new Date()) => await withKeyLock(TRIP_USAGE_KEY, async () => {
    const usage   = await readTripUsage();
    const trip    = normalizeTrip(origin, destination);
    const current = usage[trip.id] && typeof(usage[trip.id]) === 'object' ? usage[trip.id] : {};
    const slots   = current.slots && typeof(current.slots) === 'object' ? { ...current.slots } : {};
    const slot    = toUsageSlot(date);
    const weekend = date.getDay() === 0 || date.getDay() === 6;

    slots[slot] = (Number(slots[slot]) || 0) + 1;

    usage[trip.id] = {
        origin:       trip.origin,
        destination:  trip.destination,
        count:        (Number(current.count) || 0) + 1,
        weekdayCount: (Number(current.weekdayCount) || 0) + (weekend ? 0 : 1),
        weekendCount: (Number(current.weekendCount) || 0) + (weekend ? 1 : 0),
        slots:        Object.fromEntries(Object.entries(slots).sort((left, right) => right[1] - left[1]).slice(0, MAX_TRIP_USAGE_SLOTS)),
        lastUsedAt:   date.valueOf()
    };

    const trimmed = Object.fromEntries(
        Object.entries(usage)
            .sort((left, right) => (Number(right[1]?.lastUsedAt) || 0) - (Number(left[1]?.lastUsedAt) || 0))
            .slice(0, MAX_TRIP_USAGE_ENTRIES)
    );

    return await writeJSON(TRIP_USAGE_KEY, trimmed);
});

const Preferences = {
    getThemeMode: async () => {
        const themeMode = await readJSON(THEME_MODE_KEY, 'system');

        return VALID_THEME_MODES.indexOf(themeMode) > -1
            ? themeMode
            : 'system';
    },

    setThemeMode: async themeMode => {
        if (VALID_THEME_MODES.indexOf(themeMode) === -1) {
            themeMode = 'system';
        }

        return await writeJSON(THEME_MODE_KEY, themeMode);
    },

    getFavoriteTrips: async () => await withKeyLock(FAVORITES_KEY, async () => sanitizeTrips(await readJSON(FAVORITES_KEY, []))),

    setFavoriteTrips: async trips => await writeJSON(FAVORITES_KEY, trips),

    isFavoriteTrip: async (origin, destination) => {
        const favoriteTrips = await Preferences.getFavoriteTrips();
        const trip          = normalizeTrip(origin, destination);

        return favoriteTrips.some(item => isSameTrip(item, trip));
    },

    // Applies the state the user saw and asked for (instead of toggling), so stale UI can't delete a favorite.
    // Throws when the stored list can't be read or written; nothing is overwritten in that case.
    setFavoriteTrip: async (origin, destination, shouldBeFavorite) => await withKeyLock(FAVORITES_KEY, async () => {
        const favoriteTrips = await readTripsStrict(FAVORITES_KEY);
        const trip          = normalizeTrip(origin, destination);
        const otherTrips    = favoriteTrips.filter(item => !isSameTrip(item, trip));

        await writeJSONStrict(FAVORITES_KEY, shouldBeFavorite ? [ trip, ...otherTrips ] : otherTrips);

        return shouldBeFavorite;
    }),

    getRecentTrips: async () => await withKeyLock(RECENTS_KEY, async () => sanitizeTrips(await readJSON(RECENTS_KEY, []))),

    // Keeps up to MAX_RECENT_TRIPS per origin so trips from other origins don't evict them.
    recordRecentTrip: async (origin, destination) => await withKeyLock(RECENTS_KEY, async () => {
        try {
            const recentTrips      = await readTripsStrict(RECENTS_KEY);
            const trip             = normalizeTrip(origin, destination);
            const tripsByOriginIds = {};

            const nextRecentTrips = [
                trip,
                ...recentTrips.filter(item => !isSameTrip(item, trip))
            ].filter(item => {
                tripsByOriginIds[item.origin.id] = (tripsByOriginIds[item.origin.id] || 0) + 1;

                return tripsByOriginIds[item.origin.id] <= MAX_RECENT_TRIPS;
            }).slice(0, MAX_RECENT_TRIPS_TOTAL);

            await writeJSONStrict(RECENTS_KEY, nextRecentTrips);

            // Usage stats only feed the opt-in routine suggestion; failing to record them is harmless.
            recordTripUsage(origin, destination).catch(exception => {
                console.warn('Preferences: couldn\'t record trip usage:', exception);
            });

            return true;
        } catch (exception) {
            console.warn('Preferences: couldn\'t record recent trip:', exception);
        }

        return false;
    }),

    buildTrip: (origin, destination) => normalizeTrip(origin, destination),

    isSameTrip: (left, right) => isSameTrip(left, right),

    // Maps a stored trip to current station objects; returns null if either end no longer exists.
    resolveTrip: (trip, stations) => {
        if (!isValidTrip(trip) || !Array.isArray(stations)) { return null; }

        const origin      = resolveStation(trip.origin,      stations);
        const destination = resolveStation(trip.destination, stations);

        if (!origin || !destination || origin.id === destination.id) { return null; }

        return { id: `${origin.id}:${destination.id}`, origin, destination };
    },

    // Reminders are stored per trip as { id, departureAt } (ms); older builds stored a bare notification id.
    normalizeReminder: value => {
        if (typeof(value) === 'string' && value.length > 0) { return { id: value, departureAt: null }; }

        if (value && typeof(value) === 'object' && typeof(value.id) === 'string' && value.id.length > 0) {
            return { id: value.id, departureAt: Number.isFinite(value.departureAt) ? value.departureAt : null };
        }

        return null;
    },

    getReminders: async () => {
        const reminders = await readJSON(REMINDERS_KEY, {});

        return reminders && typeof(reminders) === 'object' && !Array.isArray(reminders) ? reminders : {};
    },

    getReminder: async (origin, destination) => {
        const reminders = await Preferences.getReminders();

        return Preferences.normalizeReminder(reminders[normalizeTrip(origin, destination).id]);
    },

    setReminder: async (origin, destination, { id, departureAt }) => await withKeyLock(REMINDERS_KEY, async () => {
        const reminders = await Preferences.getReminders();

        reminders[normalizeTrip(origin, destination).id] = {
            id,
            departureAt: Number.isFinite(departureAt) ? departureAt : null
        };

        return await writeJSON(REMINDERS_KEY, reminders);
    }),

    // When expectedId is given, the entry is only removed if it still points to that notification.
    removeReminder: async (origin, destination, expectedId) => await withKeyLock(REMINDERS_KEY, async () => {
        const reminders = await Preferences.getReminders();
        const tripId    = normalizeTrip(origin, destination).id;
        const current   = Preferences.normalizeReminder(reminders[tripId]);

        if (!(tripId in reminders)) { return true; }
        if (expectedId && current && current.id !== expectedId) { return true; }

        delete reminders[tripId];

        return await writeJSON(REMINDERS_KEY, reminders);
    }),

    // Drops every stored reminder that is malformed or for which isStale(reminder) returns true.
    pruneReminders: async isStale => await withKeyLock(REMINDERS_KEY, async () => {
        const reminders = await Preferences.getReminders();
        const staleIds  = Object.keys(reminders).filter(tripId => {
            const reminder = Preferences.normalizeReminder(reminders[tripId]);

            return !reminder || isStale(reminder);
        });

        if (staleIds.length === 0) { return true; }

        staleIds.forEach(tripId => { delete reminders[tripId]; });

        return await writeJSON(REMINDERS_KEY, reminders);
    }),

    // --- F5 weekly reminders (stored as a list under `weeklyReminders`) ---

    normalizeWeeklyReminder: value => normalizeWeeklyReminder(value),

    getWeeklyReminders: async () => await withKeyLock(WEEKLY_REMINDERS_KEY, readWeeklyReminders),

    getWeeklyReminder: async id => (await Preferences.getWeeklyReminders()).find(reminder => reminder.id === id) || null,

    // Inserts or replaces (by id) a weekly reminder definition; returns the normalized stored value or null.
    saveWeeklyReminder: async reminder => await withKeyLock(WEEKLY_REMINDERS_KEY, async () => {
        const normalized = normalizeWeeklyReminder({ ...reminder, updatedAt: Date.now() });

        if (!normalized) { return null; }

        const reminders = await readWeeklyReminders();
        const index     = reminders.findIndex(item => item.id === normalized.id);

        if (index > -1) {
            normalized.createdAt = reminders[index].createdAt;
            reminders[index]     = normalized;
        } else {
            reminders.push(normalized);
        }

        return await writeJSON(WEEKLY_REMINDERS_KEY, reminders) ? normalized : null;
    }),

    removeWeeklyReminder: async id => await withKeyLock(WEEKLY_REMINDERS_KEY, async () => {
        const reminders = await readWeeklyReminders();
        const remaining = reminders.filter(reminder => reminder.id !== id);

        if (remaining.length === reminders.length) { return true; }

        return await writeJSON(WEEKLY_REMINDERS_KEY, remaining);
    }),

    isValidReminderTime: time => TIME_PATTERN.test(String(time)),

    reminderLeadOptions: VALID_LEAD_MINUTES,

    // --- F5 routine suggestion inputs ---

    getTripUsage: async () => await withKeyLock(TRIP_USAGE_KEY, readTripUsage),

    recordTripUsage: async (origin, destination, date) => await recordTripUsage(origin, destination, date),

    getDismissedRoutineSuggestions: async () => {
        const dismissed = await readJSON(ROUTINE_DISMISSED_KEY, []);

        return Array.isArray(dismissed) ? dismissed.filter(id => typeof(id) === 'string') : [];
    },

    dismissRoutineSuggestion: async tripId => await withKeyLock(ROUTINE_DISMISSED_KEY, async () => {
        const dismissed = await Preferences.getDismissedRoutineSuggestions();

        if (dismissed.indexOf(tripId) > -1) { return true; }

        return await writeJSON(ROUTINE_DISMISSED_KEY, [ ...dismissed, tripId ].slice(-MAX_TRIP_USAGE_ENTRIES));
    }),

    getExactAlarmHintShown: async () => Boolean(await readJSON(`${KEY_PREFIX}exactAlarmHintShown`, false)),

    setExactAlarmHintShown: async () => await writeJSON(`${KEY_PREFIX}exactAlarmHintShown`, true),

    getScheduleScrollHintFullScrollCount: async () => {
        const count = await readJSON(SCHEDULE_SCROLL_HINT_FULL_SCROLL_COUNT_KEY, 0);

        return Number.isFinite(count)
            ? Math.max(0, Math.min(MAX_SCHEDULE_SCROLL_HINT_FULL_SCROLL_COUNT, count))
            : 0;
    },

    incrementScheduleScrollHintFullScrollCount: async () => {
        const count     = await Preferences.getScheduleScrollHintFullScrollCount();
        const nextCount = Math.min(MAX_SCHEDULE_SCROLL_HINT_FULL_SCROLL_COUNT, count + 1);

        await writeJSON(SCHEDULE_SCROLL_HINT_FULL_SCROLL_COUNT_KEY, nextCount);

        return nextCount;
    }
};

export default Preferences;

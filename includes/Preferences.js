import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'belgranowear.preferences.';
const THEME_MODE_KEY = `${KEY_PREFIX}themeMode`;
const FAVORITES_KEY  = `${KEY_PREFIX}favoriteTrips`;
const RECENTS_KEY    = `${KEY_PREFIX}recentTrips`;
const REMINDERS_KEY  = `${KEY_PREFIX}reminderNotificationIds`;
const SCHEDULE_SCROLL_HINT_FULL_SCROLL_COUNT_KEY = `${KEY_PREFIX}scheduleScrollHintFullScrollCount`;

const VALID_THEME_MODES = [ 'system', 'light', 'dark' ];
const MAX_RECENT_TRIPS  = 5;
const MAX_SCHEDULE_SCROLL_HINT_FULL_SCROLL_COUNT = 3;

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

    getFavoriteTrips: async () => await readJSON(FAVORITES_KEY, []),

    setFavoriteTrips: async trips => await writeJSON(FAVORITES_KEY, trips),

    isFavoriteTrip: async (origin, destination) => {
        const favoriteTrips = await Preferences.getFavoriteTrips();
        const targetId      = normalizeTrip(origin, destination).id;

        return favoriteTrips.some(trip => trip.id === targetId);
    },

    toggleFavoriteTrip: async (origin, destination) => {
        const favoriteTrips = await Preferences.getFavoriteTrips();
        const trip          = normalizeTrip(origin, destination);
        const exists        = favoriteTrips.some(item => item.id === trip.id);

        const nextFavoriteTrips = exists
            ? favoriteTrips.filter(item => item.id !== trip.id)
            : [ trip, ...favoriteTrips.filter(item => item.id !== trip.id) ];

        await Preferences.setFavoriteTrips(nextFavoriteTrips);

        return !exists;
    },

    getRecentTrips: async () => await readJSON(RECENTS_KEY, []),

    recordRecentTrip: async (origin, destination) => {
        const recentTrips = await Preferences.getRecentTrips();
        const trip        = normalizeTrip(origin, destination);

        const nextRecentTrips = [
            trip,
            ...recentTrips.filter(item => item.id !== trip.id)
        ].slice(0, MAX_RECENT_TRIPS);

        return await writeJSON(RECENTS_KEY, nextRecentTrips);
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

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'belgranowear.preferences.';
const THEME_MODE_KEY = `${KEY_PREFIX}themeMode`;
const FAVORITES_KEY  = `${KEY_PREFIX}favoriteTrips`;
const RECENTS_KEY    = `${KEY_PREFIX}recentTrips`;
const REMINDERS_KEY  = `${KEY_PREFIX}reminderNotificationIds`;

const VALID_THEME_MODES = [ 'system', 'light', 'dark' ];
const MAX_RECENT_TRIPS  = 5;

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

    getReminderNotificationId: async (origin, destination) => {
        const reminders = await readJSON(REMINDERS_KEY, {});
        const tripId    = normalizeTrip(origin, destination).id;

        return reminders[tripId] || null;
    },

    setReminderNotificationId: async (origin, destination, notificationId) => {
        const reminders = await readJSON(REMINDERS_KEY, {});
        const tripId    = normalizeTrip(origin, destination).id;

        reminders[tripId] = notificationId;

        return await writeJSON(REMINDERS_KEY, reminders);
    }
};

export default Preferences;

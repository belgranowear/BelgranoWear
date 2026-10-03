import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_ENVELOPE_VERSION = 1;

// Entries are stored as { __cacheEnvelope, data, fetchedAt }; older entries hold the plain data.
const isCacheEnvelope = value => (
    value !== null &&
    typeof(value) == 'object' &&
    !Array.isArray(value) &&
    value.__cacheEnvelope === CACHE_ENVELOPE_VERSION &&
    Object.prototype.hasOwnProperty.call(value, 'data')
);

const getStoredValue = async key => {
    const value = await AsyncStorage.getItem(key);

    return value !== null ? JSON.parse(value) : null;
};

const Cache = {
    set: async (key, value) => {
        try {
            await AsyncStorage.setItem(key, JSON.stringify({
                __cacheEnvelope: CACHE_ENVELOPE_VERSION,
                data:            value,
                fetchedAt:       Date.now()
            }));

            return true;
        } catch (exception) {
            console.warn('Cache: store:', exception);
        }

        return false;
    },

    get: async key => {
        try {
            const value = await getStoredValue(key);

            if (value !== null) {
                return isCacheEnvelope(value) ? value.data : value;
            }
        } catch (exception) {
            console.warn('Cache: get:', exception);
        }

        return null;
    },

    getFetchedAt: async key => {
        try {
            const value = await getStoredValue(key);

            if (isCacheEnvelope(value) && Number.isFinite(value.fetchedAt)) {
                return value.fetchedAt;
            }
        } catch (exception) {
            console.warn('Cache: getFetchedAt:', exception);
        }

        return null;
    },

    has: async key => await AsyncStorage.getItem(key) !== null,

    keys: async () => await AsyncStorage.getAllKeys(),

    remove: async key => {
        try {
            await AsyncStorage.removeItem(key);
            return true;
        } catch (exception) {
            console.warn('Cache: remove:', exception);
        }

        return false;
    },

    clear: async () => {
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter(key => key.indexOf('http') === 0);

        if (cacheKeys.length === 0) { return; }

        return await AsyncStorage.multiRemove(cacheKeys);
    }
};

export default Cache;

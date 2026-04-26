import AsyncStorage from '@react-native-async-storage/async-storage';

const Cache = {
    set: async (key, value) => {
        try {
            return await AsyncStorage.setItem(key, JSON.stringify(value));
        } catch (exception) {
            console.warn('Cache: store:', exception);
        }

        return false;
    },

    get: async key => {
        try {
            const value = await AsyncStorage.getItem(key);

            if (value !== null) {
                return JSON.parse(value);
            }
        } catch (exception) {
            console.warn('Cache: get:', exception);
        }

        return null;
    },

    has: async key => await AsyncStorage.getItem(key) !== null,

    keys: async () => await AsyncStorage.getAllKeys(),

    clear: async () => {
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter(key => key.indexOf('http') === 0);

        if (cacheKeys.length === 0) { return; }

        return await AsyncStorage.multiRemove(cacheKeys);
    }
};

export default Cache;

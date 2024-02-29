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

    clear: async () => await AsyncStorage.clear()
};

export default Cache;
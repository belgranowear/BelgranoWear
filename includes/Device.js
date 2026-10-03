import { NativeModules, Platform } from 'react-native';

import { isWatchUIPreview } from './UIPreview';

// Only used when the native BelgranoDevice module is missing (Expo Go): a real watch is
// ~180-240dp wide, while foldable cover screens and split windows start around 360dp.
const WATCH_FALLBACK_MAX_SHORTEST_SIDE = 320;
const SQUARE_TOLERANCE                 = 32;

let nativeConstants;

const getNativeConstants = () => {
    if (typeof(nativeConstants) !== 'undefined') { return nativeConstants; }

    nativeConstants = null;

    const nativeModule = NativeModules?.BelgranoDevice;

    if (!nativeModule) { return nativeConstants; }

    try {
        nativeConstants = typeof(nativeModule.getConstants) === 'function'
            ? { ...nativeModule, ...nativeModule.getConstants() }
            : nativeModule;
    } catch (exception) {
        console.warn('Device: failed to read native constants:', exception);

        nativeConstants = nativeModule;
    }

    return nativeConstants;
};

const isNearlySquare = (width, height) =>
    typeof(width) === 'number' && typeof(height) === 'number' && Math.abs(width - height) <= SQUARE_TOLERANCE;

export function isWatchDevice({ width, height } = {}) {
    if (Platform.constants?.uiMode === 'watch' || isWatchUIPreview()) { return true; }

    const constants = getNativeConstants();

    if (typeof(constants?.hasWatchFeature) === 'boolean') { return constants.hasWatchFeature; }

    return Platform.OS === 'android'
        && isNearlySquare(width, height)
        && Math.min(width, height) <= WATCH_FALLBACK_MAX_SHORTEST_SIDE;
}

export function isRoundScreen({ width, height, watch } = {}) {
    if (typeof(watch) === 'undefined') { watch = isWatchDevice({ width, height }); }

    if (!watch) { return false; }

    const constants = getNativeConstants();

    if (typeof(constants?.isScreenRound) === 'boolean') { return constants.isScreenRound; }

    return isNearlySquare(width, height);
}

export default { isWatchDevice, isRoundScreen };

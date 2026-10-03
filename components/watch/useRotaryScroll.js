import { useCallback, useEffect, useMemo, useRef } from 'react';

import { DeviceEventEmitter, PixelRatio, Platform } from 'react-native';

// Event emitted by MainActivity (plugins/withBelgranoRotary.js). Payload: `{ delta }`, in
// physical pixels, already scaled by the system vertical scroll factor; positive = scroll down.
export const ROTARY_EVENT = 'belgranoRotary';

const scrollNodeTo = (node, y) => {
    if (!node) { return false; }

    // FlatList / VirtualizedList.
    if (typeof(node.scrollToOffset) === 'function') {
        node.scrollToOffset({ offset: y, animated: false });
        return true;
    }

    // ScrollView (also Animated.ScrollView, whose ref forwards to the instance).
    if (typeof(node.scrollTo) === 'function') {
        node.scrollTo({ y, animated: false });
        return true;
    }

    // SectionList and other wrappers only expose their scroll responder.
    const responder = typeof(node.getScrollResponder) === 'function' ? node.getScrollResponder() : null;

    if (responder && typeof(responder.scrollTo) === 'function') {
        responder.scrollTo({ y, animated: false });
        return true;
    }

    return false;
};

/**
 * Scrolls `scrollRef` (a ScrollView / FlatList / SectionList ref) when the user turns
 * the watch crown or rotating bezel. Native rotary events are delivered through the
 * `withBelgranoRotary` config plugin. No-op on iOS, web and when the plugin is missing.
 *
 * @param {React.RefObject} scrollRef
 * @param {object}  [options]
 * @param {boolean} [options.enabled=true]  Only the focused screen should listen.
 * @param {number}  [options.multiplier=1]  Pixels scrolled per native rotary unit, scaled.
 * @param {Function} [options.onScroll]     Optional. Chained after the hook's own handler, so the
 *                                          caller can keep a single `onScroll` prop (plain
 *                                          function, not an `Animated.event` object).
 * @returns {{ onScroll: Function }} Pass `onScroll` to the scrollable so the hook can
 *          track the current offset (`scrollEventThrottle={16}`).
 */
export default function useRotaryScroll(scrollRef, options = {}) {
    const { enabled = true, multiplier = 1, onScroll: chainedOnScroll } = options;

    const offsetRef    = useRef(0);
    const maxOffsetRef = useRef(null);
    const chainedRef   = useRef(chainedOnScroll);

    chainedRef.current = chainedOnScroll;

    const onScroll = useCallback(event => {
        const { contentOffset, contentSize, layoutMeasurement } = event?.nativeEvent || {};

        if (contentOffset && typeof(contentOffset.y) === 'number') {
            offsetRef.current = contentOffset.y;
        }

        if (contentSize && layoutMeasurement) {
            maxOffsetRef.current = Math.max(0, contentSize.height - layoutMeasurement.height);
        }

        if (typeof(chainedRef.current) === 'function') { chainedRef.current(event); }
    }, []);

    useEffect(() => {
        if (!enabled || Platform.OS !== 'android') { return undefined; }

        const subscription = DeviceEventEmitter.addListener(ROTARY_EVENT, payload => {
            const delta = Number(payload?.delta);

            if (!Number.isFinite(delta) || delta === 0) { return; }

            // Native delta is in physical pixels; ScrollView offsets are in dp.
            const step     = (delta / PixelRatio.get()) * multiplier;
            const maxValue = maxOffsetRef.current;
            let target     = Math.max(0, offsetRef.current + step);

            if (typeof(maxValue) === 'number') { target = Math.min(target, maxValue); }
            if (target === offsetRef.current)  { return; }

            try {
                if (scrollNodeTo(scrollRef?.current, target)) {
                    // Track optimistically: several rotary events can arrive before onScroll.
                    offsetRef.current = target;
                }
            } catch (exception) {
                console.warn('useRotaryScroll: failed to scroll:', exception);
            }
        });

        return () => subscription.remove();
    }, [ enabled, multiplier, scrollRef ]);

    return useMemo(() => ({ onScroll }), [ onScroll ]);
}

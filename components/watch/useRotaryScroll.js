/**
 * Scrolls `scrollRef` (a ScrollView / FlatList / SectionList ref) when the user turns
 * the watch crown or rotating bezel. Native rotary events are delivered through the
 * `withBelgranoRotary` config plugin. Contract (stub: no-op until implemented — owned by
 * the watch primitives area):
 *
 * @param {React.RefObject} scrollRef
 * @param {object}  [options]
 * @param {boolean} [options.enabled=true]  Only the focused screen should listen.
 * @param {number}  [options.multiplier=1]  Pixels scrolled per native rotary unit, scaled.
 * @returns {{ onScroll: Function }} Pass `onScroll` to the scrollable so the hook can
 *          track the current offset (`scrollEventThrottle={16}`).
 */
export default function useRotaryScroll(scrollRef, options = {}) {
    return { onScroll: undefined };
}

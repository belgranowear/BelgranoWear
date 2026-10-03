import { useContext, useEffect, useRef } from 'react';

import { Platform } from 'react-native';

import { NavigationContext } from '@react-navigation/native';

// Expo web renders every screen inside bounded ScrollViews (body has overflow:hidden), so the
// browser's own PageDown/Space/arrow handling has nothing to scroll while focus sits on <body>.
// Each scrollable registers here; one document-level keydown listener scrolls the best match:
// the pane under the pointer most recently, otherwise the first one mounted on the focused screen.

const ARROW_STEP = 48;

const entries = new Set();

let sequence = 0;
let listenerAttached = false;

const resolveNode = ref => {
    const instance = ref?.current;

    if (!instance) { return null; }

    const node = (typeof(instance.getScrollableNode) === 'function' && instance.getScrollableNode())
        || (typeof(instance.getNativeScrollRef) === 'function' && instance.getNativeScrollRef())
        || instance;

    return node && typeof(node.scrollBy) === 'function' ? node : null;
};

const isEditableTarget = element => {
    if (!element || typeof(element.tagName) !== 'string') { return false; }

    const tag = element.tagName.toLowerCase();

    return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
};

const pickEntry = () => {
    let best = null;

    entries.forEach(entry => {
        if (!entry.enabled) { return; }
        if (entry.navigation && typeof(entry.navigation.isFocused) === 'function' && !entry.navigation.isFocused()) { return; }

        const node = resolveNode(entry.ref);

        if (!node || node.scrollHeight <= node.clientHeight + 1) { return; }

        if (
            !best
            || entry.lastPointerAt > best.lastPointerAt
            || (entry.lastPointerAt === best.lastPointerAt && entry.order < best.order)
        ) {
            best = entry;
        }
    });

    return best;
};

const handleKeyDown = event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) { return; }

    const active = document.activeElement;

    // A focused element inside a scroller gets the browser's native keyboard scrolling (and
    // Space activates focused buttons), so only step in while nothing in particular is focused.
    if (active && active !== document.body && active !== document.documentElement) { return; }
    if (isEditableTarget(event.target)) { return; }

    const entry = pickEntry();
    const node = entry ? resolveNode(entry.ref) : null;

    if (!node) { return; }

    const page = Math.max(ARROW_STEP, node.clientHeight * 0.9);
    let delta = null;
    let absolute = null;

    switch (event.key) {
        case 'ArrowDown': delta = ARROW_STEP;                    break;
        case 'ArrowUp':   delta = -ARROW_STEP;                   break;
        case 'PageDown':  delta = page;                          break;
        case 'PageUp':    delta = -page;                         break;
        case ' ':
        case 'Spacebar':  delta = event.shiftKey ? -page : page; break;
        case 'Home':      absolute = 0;                          break;
        case 'End':       absolute = node.scrollHeight;          break;
        default:          return;
    }

    event.preventDefault();

    if (absolute !== null) {
        node.scrollTo({ top: absolute, behavior: 'smooth' });
    } else {
        node.scrollBy({ top: delta, behavior: 'smooth' });
    }
};

const ensureListener = () => {
    if (listenerAttached || typeof(document) === 'undefined') { return; }

    document.addEventListener('keydown', handleKeyDown);
    listenerAttached = true;
};

/**
 * Makes a ScrollView reachable with the keyboard on web (PageUp/PageDown, Space/Shift+Space,
 * arrows, Home/End). No-op on native.
 *
 * @param {React.RefObject} scrollRef  Ref to a ScrollView / Animated.ScrollView / FlatList.
 * @param {object}  [options]
 * @param {boolean} [options.enabled=true]
 */
export default function useWebKeyboardScroll(scrollRef, { enabled = true } = {}) {
    const navigation = useContext(NavigationContext);
    const entryRef = useRef(null);

    if (!entryRef.current) {
        entryRef.current = { ref: scrollRef, order: sequence++, lastPointerAt: 0, enabled, navigation };
    }

    entryRef.current.ref = scrollRef;
    entryRef.current.enabled = enabled;
    entryRef.current.navigation = navigation;

    useEffect(() => {
        if (Platform.OS !== 'web' || typeof(document) === 'undefined') { return undefined; }

        const entry = entryRef.current;
        const node = resolveNode(scrollRef);
        const markPointer = () => { entry.lastPointerAt = Date.now(); };

        ensureListener();
        entries.add(entry);

        if (node && typeof(node.addEventListener) === 'function') {
            node.addEventListener('pointerenter', markPointer);
            node.addEventListener('wheel', markPointer, { passive: true });
        }

        return () => {
            entries.delete(entry);

            if (node && typeof(node.removeEventListener) === 'function') {
                node.removeEventListener('pointerenter', markPointer);
                node.removeEventListener('wheel', markPointer);
            }
        };
    }, [ scrollRef ]);
}

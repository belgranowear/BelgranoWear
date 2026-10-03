import React, { useRef } from 'react';

import { Menu } from 'react-native-paper';

/**
 * Paper's <Menu> runs its hide() path on mount, and on web that ends by focusing the anchor
 * (focusFirstDOMNode), which draws a focus ring on load and makes Space/PageDown activate the
 * button instead of scrolling. Render the bare anchor until the menu has been opened once.
 * Accepts the same props as Paper's Menu.
 */
export default function LazyMenu(props) {
    const hasOpened = useRef(false);

    if (props.visible) { hasOpened.current = true; }

    return hasOpened.current ? <Menu {...props} /> : props.anchor;
}

LazyMenu.Item = Menu.Item;

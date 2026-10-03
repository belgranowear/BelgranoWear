import React from 'react';

import { Button } from 'react-native-paper';

/**
 * Wear OS "edge-hugging" primary action pinned to the bottom of the screen.
 * On round displays it is drawn as a bottom cap that follows the bezel; on
 * square displays it falls back to a full-width pill. Contract (stub — owned by
 * the watch primitives area):
 *
 * @param {object}   props
 * @param {string}   props.label               Visible text (keep it short: 1–2 words).
 * @param {string}   [props.icon]              MaterialCommunityIcons name shown before the label.
 * @param {Function} props.onPress
 * @param {boolean}  [props.disabled]
 * @param {string}   [props.accessibilityLabel]
 * @param {object}   [props.style]
 */
export default function EdgeButton({ label, icon, onPress, disabled, accessibilityLabel, style }) {
    return (
        <Button mode="contained" icon={icon} onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel || label} style={style}>
            {label}
        </Button>
    );
}

import React from 'react';

import { Text } from 'react-native-paper';

/**
 * Text that follows the top (or bottom) arc of a round watch face, like Wear OS
 * TimeText. Renders straight text on square displays. Contract (stub — owned by
 * the watch primitives area):
 *
 * @param {object} props
 * @param {string} props.text
 * @param {'top'|'bottom'} [props.position='top']
 * @param {number} [props.fontSize=12]
 * @param {string} [props.color]   Defaults to theme textMuted.
 * @param {object} [props.style]
 */
export default function CurvedText({ text, color, fontSize = 12, style }) {
    return <Text style={[ { textAlign: 'center', fontSize, color }, style ]} numberOfLines={1}>{text}</Text>;
}

import React from 'react';

import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from 'react-native-paper';
import Svg, { Defs, Path, Text as SvgText, TextPath } from 'react-native-svg';

import { isRoundScreen, isWatchDevice } from '../../includes/Device';
import { useTheme } from '../../includes/Theme';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

let pathIdCounter = 0;

/**
 * Text that follows the top (or bottom) arc of a round watch face, like Wear OS
 * TimeText. Renders straight, centered text on square watches and on phones.
 *
 * The arc is sized from the screen radius, so on round watches the component must sit at
 * the very top (`position="top"`) or bottom (`position="bottom"`) of the screen; pass
 * `absolute` to pin it there regardless of the surrounding layout.
 *
 * @param {object} props
 * @param {string} props.text
 * @param {'top'|'bottom'} [props.position='top']
 * @param {number} [props.fontSize=12]
 * @param {string} [props.color]   Defaults to theme textMuted.
 * @param {object} [props.style]
 * @param {boolean} [props.absolute=false]  Optional. Absolutely position at the top/bottom edge.
 * @param {number}  [props.inset]           Optional. Gap between the bezel and the glyphs (dp);
 *                                          defaults to ~2.5 % of the screen.
 * @param {string}  [props.fontWeight='500'] Optional.
 */
export default function CurvedText({
    text,
    position   = 'top',
    color,
    fontSize   = 12,
    style,
    absolute   = false,
    inset,
    fontWeight = '500'
}) {
    const { theme } = useTheme();
    const { width, height } = useWindowDimensions();
    const pathId = React.useMemo(() => `belgranoCurvedText${++pathIdCounter}`, []);

    const textColor = color || theme.textMuted;
    const watch     = isWatchDevice({ width, height });
    const round     = watch && isRoundScreen({ width, height, watch });
    const bottom    = position === 'bottom';
    const value     = text === null || typeof(text) === 'undefined' ? '' : String(text);

    const edgeStyle = absolute
        ? [ round ? styles.absoluteCentered : styles.absoluteStretched, bottom ? { bottom: 0 } : { top: 0 } ]
        : null;

    if (!round) {
        return (
            <View style={[ styles.straight, edgeStyle, style ]}>
                <Text numberOfLines={1} style={{ textAlign: 'center', fontSize, fontWeight, color: textColor }}>
                    {value}
                </Text>
            </View>
        );
    }

    const shortestSide = Math.min(width, height);
    const gap          = typeof(inset) === 'number' ? inset : clamp(shortestSide * 0.025, 3, 8);
    const bandHeight   = Math.ceil(gap + (fontSize * 1.6));
    const cx           = width / 2;
    const outer        = (shortestSide / 2) - gap;

    let d;

    if (bottom) {
        // Baseline sits a little above the bezel so descenders stay inside the circle.
        // Left → right along the bottom (counter-clockwise), glyphs upright facing the centre.
        const r  = outer - (fontSize * 0.3);
        const cy = bandHeight - (height / 2);

        d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`;
    } else {
        // Baseline one cap-height inside the bezel; left → right over the top (clockwise).
        const r  = outer - (fontSize * 0.8);
        const cy = height / 2;

        d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
    }

    return (
        <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={value}
            style={[ { width, height: bandHeight, alignSelf: 'center' }, edgeStyle, style ]}
            pointerEvents="none"
        >
            <Svg width={width} height={bandHeight}>
                <Defs>
                    <Path id={pathId} d={d} fill="none" />
                </Defs>
                <SvgText fill={textColor} fontSize={fontSize} fontWeight={fontWeight} textAnchor="middle">
                    <TextPath href={`#${pathId}`} startOffset="50%">
                        {value}
                    </TextPath>
                </SvgText>
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    // Round: full window width, centred by alignSelf even inside a narrower parent.
    absoluteCentered: {
        position: 'absolute'
    },
    absoluteStretched: {
        position: 'absolute',
        left:     0,
        right:    0
    },
    straight: {
        alignSelf:      'stretch',
        alignItems:     'center',
        justifyContent: 'center'
    }
});

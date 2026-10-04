import React from 'react';

import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

let fadeIds = 0;

/**
 * Full-width band pinned to the top or bottom edge of a watch screen: solid screen background
 * over `solid` dp next to the edge, then a `fade` dp gradient to transparent. Scrolling content
 * dissolves under pinned chrome (TimeText, EdgeButton) instead of showing around it, as in the
 * Wear OS ScreenScaffold. Render it as a direct child of a full-screen container, before the
 * pinned element.
 *
 * @param {object} props
 * @param {'top'|'bottom'} props.edge
 * @param {number} props.solid   Opaque part, measured from the edge (dp).
 * @param {number} [props.fade=24]
 * @param {string} props.color   Screen background.
 */
export default function EdgeFade({ edge, solid, fade = 24, color }) {
    const { width } = useWindowDimensions();
    const id        = React.useMemo(() => `edgeFade${++fadeIds}`, []);
    const total     = Math.max(1, solid + fade);
    const top       = edge === 'top';
    const fadeStop  = String(fade / total);

    return (
        <View pointerEvents="none" style={[ styles.band, top ? styles.top : styles.bottom, { height: total } ]}>
            <Svg width={width} height={total}>
                <Defs>
                    <LinearGradient id={id} x1="0" y1="0" x2="0" y2={String(total)} gradientUnits="userSpaceOnUse">
                        {top ? [
                            <Stop key="a" offset="0" stopColor={color} stopOpacity={1} />,
                            <Stop key="b" offset={String(solid / total)} stopColor={color} stopOpacity={1} />,
                            <Stop key="c" offset="1" stopColor={color} stopOpacity={0} />
                        ] : [
                            <Stop key="a" offset="0" stopColor={color} stopOpacity={0} />,
                            <Stop key="b" offset={fadeStop} stopColor={color} stopOpacity={1} />,
                            <Stop key="c" offset="1" stopColor={color} stopOpacity={1} />
                        ]}
                    </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width={width} height={total} fill={`url(#${id})`} />
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    band: {
        position: 'absolute',
        left:     0,
        right:    0
    },
    top: {
        top: 0
    },
    bottom: {
        bottom: 0
    }
});

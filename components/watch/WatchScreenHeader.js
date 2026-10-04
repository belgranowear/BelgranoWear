import React from 'react';

import { StyleSheet, View } from 'react-native';

import { Text } from 'react-native-paper';

import { isRoundScreen } from '../../includes/Device';
import { useTheme } from '../../includes/Theme';
import { useResponsiveMetrics } from '../ui';

/**
 * Title (plus optional subtitle) for the top of a scrolling watch screen. On round faces the
 * circle is narrowest at the top, so the title sits a little lower and in a narrower box than
 * on square ones; long titles wrap to two lines or shrink instead of reaching the bezel.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 */
export default function WatchScreenHeader({ title, subtitle }) {
    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const side       = responsive.shortestSide;
    const round      = isRoundScreen({ width: responsive.width, height: responsive.height, watch: true });

    return (
        <View style={[ styles.header, { width: Math.round(side * (round ? 0.66 : 0.9)), paddingTop: round ? Math.round(side * 0.07) : 0 } ]}>
            <Text
                accessibilityRole="header"
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[ styles.title, { color: theme.text } ]}
            >
                {title}
            </Text>
            {subtitle ? (
                <Text numberOfLines={1} style={[ styles.subtitle, { color: theme.textMuted } ]}>{subtitle}</Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        alignSelf:  'center',
        alignItems: 'center',
        gap:        2
    },
    title: {
        textAlign:  'center',
        fontSize:   17,
        lineHeight: 21,
        fontWeight: '800'
    },
    subtitle: {
        textAlign: 'center',
        fontSize:  11,
        lineHeight: 14
    }
});

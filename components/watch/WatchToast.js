import React, { useEffect, useRef } from 'react';

import { Animated, Pressable, StyleSheet } from 'react-native';

import { Text } from 'react-native-paper';

import { useTheme } from '../../includes/Theme';
import { useResponsiveMetrics } from '../ui';

/**
 * Snackbar replacement for watches: a short message (and optional action stacked under it)
 * centred in the lower half of the face, inside the circle. Paper's Snackbar hugs the bottom
 * edge and puts the action beside the text, which a round face clips.
 *
 * Render it as the last child of a full-screen container.
 *
 * @param {object}   props
 * @param {boolean}  props.visible
 * @param {string}   props.text
 * @param {Function} props.onDismiss       Called after `duration` or when tapped.
 * @param {number}   [props.duration=3500]
 * @param {{label:string, onPress:Function}} [props.action]
 */
export default function WatchToast({ visible, text, onDismiss, duration = 3500, action }) {
    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const opacity    = useRef(new Animated.Value(0)).current;
    const side       = responsive.shortestSide;

    useEffect(() => {
        Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 160, useNativeDriver: true }).start();

        if (!visible) { return undefined; }

        const timer = setTimeout(() => onDismiss?.(), duration);

        return () => clearTimeout(timer);
    }, [ visible, duration, onDismiss, opacity ]);

    if (!visible && !text) { return null; }

    return (
        <Animated.View
            pointerEvents={visible ? 'box-none' : 'none'}
            style={[ styles.host, { opacity, bottom: Math.round(side * 0.2), paddingHorizontal: Math.round(side * 0.13) } ]}
        >
            <Pressable
                onPress={onDismiss}
                accessibilityRole="alert"
                style={[ styles.toast, { backgroundColor: theme.roles.inverseSurface || theme.text, borderRadius: theme.shape?.lg ?? 16 } ]}
            >
                <Text style={[ styles.text, { color: theme.roles.inverseOnSurface || theme.background } ]} numberOfLines={4}>{text}</Text>
                {action ? (
                    <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
                        <Text style={[ styles.action, { color: theme.roles.inversePrimary || theme.accent } ]}>{action.label}</Text>
                    </Pressable>
                ) : null}
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    host: {
        position:   'absolute',
        left:       0,
        right:      0,
        alignItems: 'center',
        zIndex:     30,
        elevation:  30
    },
    toast: {
        alignItems:        'center',
        gap:               4,
        paddingHorizontal: 14,
        paddingVertical:   10
    },
    text: {
        fontSize:   12,
        lineHeight: 16,
        textAlign:  'center'
    },
    action: {
        fontSize:   13,
        fontWeight: '700'
    }
});

import React, { useEffect, useRef, useState } from 'react';

import {
    Animated,
    BackHandler,
    Easing,
    Platform,
    Pressable,
    StyleSheet,
    View
} from 'react-native';

import { Portal } from 'react-native-paper';

import { useTheme } from '../../includes/Theme';

const useNativeDriver = Platform.OS !== 'web';

// M3 "emphasized accelerate": exits are short and leave fast, no bounce.
const EXIT_DURATION = 200;
const EXIT_EASING   = Easing.bezier(0.3, 0, 0.8, 0.15);

/**
 * Modal bottom sheet (or centered dialog) with M3 Expressive motion: slides/scales in on the
 * default spatial spring and fades the scrim with the effects spring; stays mounted while the
 * exit animation runs so closing is animated too.
 *
 * @param {object}   props
 * @param {boolean}  props.visible
 * @param {Function} props.onDismiss       scrim tap / Android back.
 * @param {boolean}  [props.centered]      dialog (tablet/desktop) instead of a bottom sheet.
 * @param {object}   [props.style]         style of the sheet surface.
 */
export default function AnimatedSheet({ visible, onDismiss, centered = false, style, children }) {
    const { theme }  = useTheme();
    const progress   = useRef(new Animated.Value(0)).current;
    const [ mounted, setMounted ] = useState(visible);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            progress.stopAnimation();
            Animated.spring(progress, {
                toValue: 1,
                useNativeDriver,
                ...theme.motion.spring.defaultSpatial,
                restDisplacementThreshold: 0.001,
                restSpeedThreshold:        0.001
            }).start();
            return;
        }

        Animated.timing(progress, {
            toValue:  0,
            duration: EXIT_DURATION,
            easing:   EXIT_EASING,
            useNativeDriver
        }).start(({ finished }) => { if (finished) { setMounted(false); } });
    }, [ visible ]);

    useEffect(() => {
        if (!visible || Platform.OS !== 'android') { return; }

        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            onDismiss?.();
            return true;
        });

        return () => subscription.remove();
    }, [ visible, onDismiss ]);

    if (!mounted) { return null; }

    const scrimOpacity = progress.interpolate({ inputRange: [ 0, 1 ], outputRange: [ 0, 1 ], extrapolate: 'clamp' });
    const surfaceMotion = centered
        ? {
            opacity:   progress.interpolate({ inputRange: [ 0, 0.6 ], outputRange: [ 0, 1 ], extrapolate: 'clamp' }),
            transform: [ { scale: progress.interpolate({ inputRange: [ 0, 1 ], outputRange: [ 0.88, 1 ] }) } ]
        }
        : {
            transform: [ { translateY: progress.interpolate({ inputRange: [ 0, 1 ], outputRange: [ 640, 0 ] }) } ]
        };

    return (
        <Portal>
            <View style={[ StyleSheet.absoluteFill, centered ? styles.hostCentered : styles.host ]} pointerEvents={visible ? 'box-none' : 'none'}>
                <Animated.View style={[ StyleSheet.absoluteFill, { backgroundColor: theme.paperTheme?.colors?.backdrop || 'rgba(0,0,0,0.32)', opacity: scrimOpacity } ]}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={onDismiss}
                        accessibilityRole="button"
                        accessible={false}
                        focusable={false}
                    />
                </Animated.View>
                <Animated.View style={[ style, surfaceMotion ]} accessibilityViewIsModal>
                    {children}
                </Animated.View>
            </View>
        </Portal>
    );
}

const styles = StyleSheet.create({
    host: {
        justifyContent: 'flex-end'
    },
    hostCentered: {
        justifyContent: 'center',
        padding:        24
    }
});

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
    Animated,
    BackHandler,
    Easing,
    PanResponder,
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

// Drag-to-dismiss: past this distance or flick speed the sheet closes, otherwise it springs back.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.8;

const SheetDragContext = createContext(null);

/**
 * Area of the sheet (drag handle + header) that can be swiped down to dismiss it. Kept out of the
 * scrollable body so vertical scrolling and the dismiss gesture never compete.
 */
export function SheetDragArea({ children, style }) {
    const panHandlers = useContext(SheetDragContext);

    return <View style={style} {...(panHandlers || {})}>{children}</View>;
}

/**
 * Modal bottom sheet (or centered dialog) with M3 Expressive motion: slides/scales in on the
 * default spatial spring and fades the scrim with the effects spring; stays mounted while the
 * exit animation runs so closing is animated too. As a bottom sheet, the content wrapped in
 * `SheetDragArea` (handle + header) can be swiped down to dismiss.
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
    const dragY      = useRef(new Animated.Value(0)).current;
    const [ mounted, setMounted ] = useState(visible);
    const dismissRef = useRef(onDismiss);
    dismissRef.current = onDismiss;

    const panResponder = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder:        (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderTerminationRequest:   () => false,
        // Upward drags get a rubber-band resistance; the sheet never lifts off the bottom edge.
        onPanResponderMove:    (_, g) => dragY.setValue(g.dy > 0 ? g.dy : g.dy / 8),
        onPanResponderRelease: (_, g) => {
            if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
                dismissRef.current?.();
                return;
            }

            Animated.spring(dragY, { toValue: 0, velocity: g.vy, useNativeDriver, ...theme.motion.spring.fastSpatial }).start();
        },
        onPanResponderTerminate: () => {
            Animated.spring(dragY, { toValue: 0, useNativeDriver, ...theme.motion.spring.fastSpatial }).start();
        }
    }), [ theme ]);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            dragY.setValue(0);
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
            // Exit continues from wherever the drag left the sheet.
            transform: [ { translateY: Animated.add(progress.interpolate({ inputRange: [ 0, 1 ], outputRange: [ 640, 0 ] }), dragY) } ]
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
                    <SheetDragContext.Provider value={centered ? null : panResponder.panHandlers}>
                        {children}
                    </SheetDragContext.Provider>
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

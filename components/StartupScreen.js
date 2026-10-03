import React, { useEffect, useRef } from 'react';

import { Animated, Image, Platform, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import Lang from '../includes/Lang';
import { useTheme } from '../includes/Theme';

import LoadingIndicator from './layout/LoadingIndicator';
import { useResponsiveMetrics } from './ui';

const useNativeDriver = Platform.OS !== 'web';
const APP_ICON        = require('../assets/splash-icon.png');

// Keep in sync with the native launch screen (plugins/withBelgranoNativeConfig.js): the icon sits
// at the exact same spot and size, so hiding the native splash reveals an identical frame and only
// the progress row fades in.
export const STARTUP_ICON_SIZE       = 120;
export const STARTUP_ICON_SIZE_SHORT = 88;
export const STARTUP_ICON_SIZE_WATCH = 52;
const STARTUP_ICON_SIZE_WATCH_COMPACT = 36;
const TITLE_GAP = 24;

// Secondary way out of a long wait (e.g. "Elegir manualmente" while the GPS looks for a fix).
// Fades in on the effects spring when it appears, so it never pops in.
function StartupAction({ action, compact }) {
    const { theme } = useTheme();
    const progress  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(progress, { toValue: 1, useNativeDriver, ...theme.motion.spring.defaultEffects }).start();
    }, []);

    return (
        <Animated.View style={{ opacity: progress }}>
            <Button
                mode={compact ? 'text' : 'outlined'}
                compact={compact}
                icon={compact ? undefined : 'map-marker-outline'}
                onPress={action.onPress}
                labelStyle={compact ? styles.watchActionLabel : undefined}
                style={compact ? styles.watchAction : styles.action}
            >
                {action.label}
            </Button>
        </Animated.View>
    );
}

function OperationText({ operation, style, numberOfLines }) {
    const { theme } = useTheme();
    const progress  = useRef(new Animated.Value(0)).current;

    // Every new step fades/lifts in on the effects spring, so progress reads as movement.
    useEffect(() => {
        progress.setValue(0);
        Animated.spring(progress, { toValue: 1, useNativeDriver, ...theme.motion.spring.defaultEffects }).start();
    }, [ operation ]);

    const translateY = progress.interpolate({ inputRange: [ 0, 1 ], outputRange: [ 6, 0 ] });

    return (
        <Animated.View style={{ opacity: progress, transform: [ { translateY } ] }}>
            <Text
                variant="bodyLarge"
                numberOfLines={numberOfLines}
                accessibilityLiveRegion="polite"
                style={[ styles.operation, { color: theme.roles.onSurfaceVariant }, style ]}
            >
                {operation}
            </Text>
        </Animated.View>
    );
}

/**
 * Startup / resource-loading screen: app icon + name, M3 Expressive loading indicator and the
 * current step ("Comprobando actualizaciones…", "Obteniendo mapa de estaciones…").
 *
 * @param {object} props
 * @param {string} props.operation  current step, already localized.
 * @param {{label: string, onPress: Function}} [props.action]  optional way out (e.g. skip GPS).
 */
export default function StartupScreen({ operation, action }) {
    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const entrance   = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(entrance, { toValue: 1, useNativeDriver, ...theme.motion.spring.slowSpatial }).start();
    }, []);

    const rowStyle = {
        opacity:   entrance.interpolate({ inputRange: [ 0, 0.6 ], outputRange: [ 0, 1 ], extrapolate: 'clamp' }),
        transform: [ { translateY: entrance.interpolate({ inputRange: [ 0, 1 ], outputRange: [ 24, 0 ] }) } ]
    };

    if (responsive.isWatch) {
        // The action needs the room on a round face: the icon shrinks while it is shown.
        const iconSize = action ? STARTUP_ICON_SIZE_WATCH_COMPACT : STARTUP_ICON_SIZE_WATCH;

        return (
            <View style={[ styles.root, styles.watchRoot, { backgroundColor: theme.background } ]}>
                <Image source={APP_ICON} fadeDuration={0} accessibilityIgnoresInvertColors style={{ width: iconSize, height: iconSize, borderRadius: iconSize * 0.22 }} />
                <Animated.View style={[ styles.watchRow, rowStyle ]}>
                    <LoadingIndicator size={32} accessibilityLabel={operation} />
                    <OperationText operation={operation} numberOfLines={2} style={styles.watchOperation} />
                    {action ? <StartupAction action={action} compact /> : null}
                </Animated.View>
            </View>
        );
    }

    const iconSize = responsive.isShortHeight ? STARTUP_ICON_SIZE_SHORT : STARTUP_ICON_SIZE;

    return (
        <View style={[ styles.root, { backgroundColor: theme.background } ]}>
            <Image source={APP_ICON} fadeDuration={0} accessibilityIgnoresInvertColors style={{ width: iconSize, height: iconSize, borderRadius: iconSize * 0.17 }} />

            {/* On short screens (phone landscape) the action needs the title's room. */}
            {action && responsive.isShortHeight ? null : (
            <View pointerEvents="none" style={[ styles.titleAnchor, { marginTop: (iconSize / 2) + TITLE_GAP } ]}>
                <Text
                    variant="headlineSmall"
                    accessibilityRole="header"
                    style={[ styles.title, theme.type.emphasized.headline, { color: theme.roles.onSurface } ]}
                >
                    {Lang.t('startupAppName')}
                </Text>
            </View>
            )}

            <Animated.View style={[ styles.progressRow, { bottom: responsive.isShortHeight ? 20 : '12%' }, rowStyle ]}>
                <LoadingIndicator size={responsive.isShortHeight ? 40 : 48} accessibilityLabel={operation} />
                <OperationText operation={operation} numberOfLines={2} />
                {action ? <StartupAction action={action} /> : null}
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex:           1,
        alignItems:     'center',
        justifyContent: 'center'
    },
    titleAnchor: {
        position:       'absolute',
        top:            '50%',
        left:           24,
        right:          24,
        alignItems:     'center'
    },
    title: {
        textAlign:      'center'
    },
    progressRow: {
        position:       'absolute',
        left:           24,
        right:          24,
        alignItems:     'center',
        gap:            12
    },
    operation: {
        textAlign:      'center',
        maxWidth:       360
    },
    watchRoot: {
        gap:            10,
        paddingHorizontal: '14%'
    },
    watchRow: {
        alignItems:     'center',
        gap:            8,
        alignSelf:      'stretch'
    },
    action: {
        marginTop:      4
    },
    watchAction: {
        marginTop:      -4
    },
    watchActionLabel: {
        fontSize:       13,
        marginVertical: 6
    },
    watchOperation: {
        fontSize:       12,
        lineHeight:     15,
        minHeight:      30
    }
});

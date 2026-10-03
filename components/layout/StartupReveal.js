import React, { useEffect, useRef } from 'react';

import { Animated, Platform, StyleSheet } from 'react-native';

import { useTheme } from '../../includes/Theme';

const useNativeDriver = Platform.OS !== 'web';

/**
 * Fades and lifts its content in once, when it first mounts (used for the hand-off from the
 * startup screen to the first real content). Re-renders with different children keep the
 * revealed state, so switching between content branches does not fade again.
 */
export default function StartupReveal({ children, style }) {
    const { theme } = useTheme();
    const progress  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(progress, { toValue: 1, useNativeDriver, ...theme.motion.spring.slowSpatial }).start();
    }, []);

    const opacity    = progress.interpolate({ inputRange: [ 0, 0.7 ], outputRange: [ 0, 1 ], extrapolate: 'clamp' });
    const translateY = progress.interpolate({ inputRange: [ 0, 1 ], outputRange: [ 16, 0 ] });

    return (
        <Animated.View style={[ styles.fill, style, { opacity, transform: [ { translateY } ] } ]}>
            {children}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    fill: {
        flex:      1,
        minHeight: 0
    }
});

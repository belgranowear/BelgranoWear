import React, { createContext, useContext, useRef, useState } from 'react';

import {
    Platform,
    SafeAreaView,
    Animated,
    ScrollView,
    StyleSheet,
    View,
    useWindowDimensions,
    PixelRatio
} from 'react-native';

import { Button, Card as PaperCard, Chip, Text, TouchableRipple } from 'react-native-paper';

import { useTheme } from '../includes/Theme';
import { isWatchUIPreview } from '../includes/UIPreview';

export const isWatch = () => Platform.constants?.uiMode === 'watch' || isWatchUIPreview();

const WatchScrollMetricsContext = createContext({
    enabled: false,
    scrollY: null,
    viewportHeight: 0
});

export function WatchScaleItem({ children, style, minScale = 0.66, maxScale = 1.1, minOpacity = 0.46, edgeDistanceMultiplier = 0.52 }) {
    const { enabled, scrollY, viewportHeight } = useContext(WatchScrollMetricsContext);
    const itemCenter = useRef(new Animated.Value(0)).current;
    const layoutRef = useRef({ center: 0, measured: false });
    const [ isMeasured, setIsMeasured ] = useState(false);

    if (!enabled || !scrollY || viewportHeight <= 0) {
        return <View style={[ styles.watchScaleItem, style ]}>{children}</View>;
    }

    const viewportCenter = Animated.add(scrollY, viewportHeight / 2);
    const distanceFromCenter = Animated.subtract(itemCenter, viewportCenter);
    const edgeDistance = Math.max(1, viewportHeight * edgeDistanceMultiplier);
    const centerBand = edgeDistance * 0.34;
    const scale = distanceFromCenter.interpolate({
        inputRange: [ -edgeDistance, -centerBand, 0, centerBand, edgeDistance ],
        outputRange: [ minScale, maxScale * 0.97, maxScale, maxScale * 0.97, minScale ],
        extrapolate: 'clamp'
    });
    const opacity = distanceFromCenter.interpolate({
        inputRange: [ -edgeDistance, -centerBand, 0, centerBand, edgeDistance ],
        outputRange: [ minOpacity, 0.92, 1, 0.92, minOpacity ],
        extrapolate: 'clamp'
    });
    const onLayout = event => {
        const { y, height } = event.nativeEvent.layout;

        if (height <= 0) { return; }

        const nextCenter = y + (height / 2);
        const previous = layoutRef.current;

        if (!previous.measured) {
            layoutRef.current = { center: nextCenter, measured: true };
            itemCenter.setValue(nextCenter);
            setIsMeasured(true);
            return;
        }

        if (Math.abs(nextCenter - previous.center) < 0.75) { return; }

        layoutRef.current = { center: nextCenter, measured: true };

        Animated.timing(itemCenter, {
            toValue: nextCenter,
            duration: 140,
            useNativeDriver: true
        }).start();
    };

    return (
        <Animated.View
            onLayout={onLayout}
            style={[
                styles.watchScaleItem,
                style,
                isMeasured ? {
                    opacity,
                    transform: [ { scale } ]
                } : undefined
            ]}
        >
            {children}
        </Animated.View>
    );
}

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function useResponsiveMetrics() {
    const { width, height } = useWindowDimensions();
    const shortestSide = Math.min(width, height);
    const longestSide = Math.max(width, height);
    const fontScale = PixelRatio.getFontScale();
    const watch = isWatch() || (Platform.OS === 'android' && shortestSide <= 500 && Math.abs(width - height) <= 32);
    const roundTopInset = watch ? clamp(shortestSide * 0.035, 8, 18) : 0;
    const roundBottomInset = 0;
    const roundFlowWidth = watch ? clamp(shortestSide * 0.92, 190, 420) : width;

    return {
        width,
        height,
        shortestSide,
        longestSide,
        fontScale,
        isCompact: shortestSide <= 430,
        isWatch: watch,
        roundInset: roundTopInset,
        roundTopInset,
        roundBottomInset,
        roundFlowWidth,
        roundSafeWidth: roundFlowWidth,
        scaledFont: (base, min, max) => clamp(base * fontScale, min, max)
    };
}

export function AppScreen({ children, scroll = true, contentStyle, style, onScroll }) {
    const { theme } = useTheme();
    const responsive = useResponsiveMetrics();
    const horizontalPadding = responsive.isWatch ? 0 : theme.spacing.lg;
    const scrollY = useRef(new Animated.Value(0)).current;
    const [ viewportHeight, setViewportHeight ] = useState(0);

    const frameStyle = [
        styles.screen,
        {
            backgroundColor: theme.background,
            paddingHorizontal: horizontalPadding,
            paddingTop: responsive.isWatch ? responsive.roundTopInset : theme.spacing.lg,
            paddingBottom: responsive.isWatch ? responsive.roundBottomInset : theme.spacing.xl
        },
        style
    ];
    const watchContentStyle = responsive.isWatch
        ? {
            width: '100%',
            maxWidth: responsive.roundFlowWidth,
            alignSelf: 'center'
        }
        : undefined;

    const metrics = {
        enabled: responsive.isWatch && scroll,
        scrollY,
        viewportHeight
    };

    if (!scroll) {
        return (
            <SafeAreaView style={frameStyle}>
                <WatchScrollMetricsContext.Provider value={{ ...metrics, enabled: false }}>
                    <View style={[ styles.fullHeight, watchContentStyle, contentStyle ]}>{children}</View>
                </WatchScrollMetricsContext.Provider>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={frameStyle}>
            <WatchScrollMetricsContext.Provider value={metrics}>
                <Animated.ScrollView
                    style={styles.scroll}
                    onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
                    onScroll={Animated.event(
                        [ { nativeEvent: { contentOffset: { y: scrollY } } } ],
                        { useNativeDriver: true, listener: onScroll }
                    )}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={!responsive.isWatch}
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingBottom: responsive.isWatch ? responsive.roundBottomInset : theme.spacing.xl },
                        responsive.isWatch ? undefined : contentStyle
                    ]}
                >
                    {responsive.isWatch ? <View style={[ watchContentStyle, contentStyle ]}>{children}</View> : children}
                </Animated.ScrollView>
            </WatchScrollMetricsContext.Provider>
        </SafeAreaView>
    );
}

export function TransitCard({ children, style, mode = 'contained', onPress, accessibilityLabel, accessibilityHint }) {
    const { theme } = useTheme();
    const responsive = useResponsiveMetrics();

    if (responsive.isWatch) {
        const content = (
            <View
                style={[
                    styles.watchSurface,
                    { backgroundColor: theme.background },
                    style
                ]}
            >
                <View style={styles.cardContent}>{children}</View>
            </View>
        );

        if (!onPress) { return content; }

        return (
            <TouchableRipple
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                accessibilityHint={accessibilityHint}
                borderless
                style={styles.watchTouchable}
            >
                {content}
            </TouchableRipple>
        );
    }

    const content = (
        <PaperCard
            mode={mode}
            style={[
                styles.card,
                {
                    backgroundColor: theme.paperTheme.colors.surface,
                    borderColor: theme.paperTheme.colors.outline,
                    borderRadius: theme.radius.xl
                },
                style
            ]}
        >
            <PaperCard.Content style={styles.cardContent}>{children}</PaperCard.Content>
        </PaperCard>
    );

    if (!onPress) { return content; }

    return (
        <TouchableRipple
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            borderless
            style={{ borderRadius: theme.radius.xl }}
        >
            {content}
        </TouchableRipple>
    );
}

export function ActionButton({ title, children, ...props }) {
    return <Button mode="contained" compact={false} {...props}>{children || title}</Button>;
}

export function StatusPill({ children, label, icon, tone = 'neutral', style, onPress, compact = true }) {
    const { theme } = useTheme();
    const colors = {
        accent:  { backgroundColor: theme.accentSoft,     textColor: theme.accentStrong },
        warning: { backgroundColor: theme.warningSurface, color: theme.warning },
        success: { backgroundColor: theme.successSurface, textColor: theme.success },
        offline: { backgroundColor: theme.offlineSurface, textColor: theme.offline },
        neutral: { backgroundColor: theme.paperTheme.colors.surfaceVariant, textColor: theme.paperTheme.colors.onSurfaceVariant }
    }[tone] || {};

    return (
        <Chip
            icon={icon}
            compact={compact}
            onPress={onPress}
            style={[ { backgroundColor: colors.backgroundColor }, style ]}
            textStyle={{ color: colors.textColor || colors.color, fontWeight: '700' }}
        >
            {children || label}
        </Chip>
    );
}

export function SectionHeader({ title, subtitle, action }) {
    return (
        <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
                <Text variant="titleMedium" style={styles.sectionTitle}>{title}</Text>
                {subtitle ? <Text variant="bodySmall">{subtitle}</Text> : null}
            </View>
            {action || null}
        </View>
    );
}

export function EmptyState({ title, message, action }) {
    return (
        <TransitCard style={styles.emptyState}>
            <Text variant="titleMedium" style={styles.centerText}>{title}</Text>
            {message ? <Text variant="bodyMedium" style={styles.centerText}>{message}</Text> : null}
            {action || null}
        </TransitCard>
    );
}

// Backwards-compatible exports used by smaller screens while the app moves to Paper.
export const Screen = AppScreen;
export const CardCompat = TransitCard;
export const CardBase = TransitCard;
export const CardView = TransitCard;
export const Card = TransitCard;
export const ThemedButton = ActionButton;
export const StatusChip = StatusPill;
export const ThemedText = Text;

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        width: '100%'
    },
    scroll: {
        flex: 1,
        width: '100%'
    },
    fullHeight: {
        flex: 1
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'stretch',
        justifyContent: 'flex-start'
    },
    card: {
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
        marginBottom: 12
    },
    cardContent: {
        gap: 8
    },
    watchSurface: {
        width: '100%',
        alignSelf: 'stretch',
        borderWidth: 0,
        borderRadius: 0,
        marginBottom: 0,
        overflow: 'visible'
    },
    watchTouchable: {
        width: '100%',
        alignSelf: 'stretch'
    },
    watchScaleItem: {
        width: '100%',
        alignSelf: 'stretch'
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 8,
        marginBottom: 10
    },
    sectionHeaderText: {
        flex: 1
    },
    sectionTitle: {
        fontWeight: '800'
    },
    centerText: {
        textAlign: 'center'
    },
    emptyState: {
        alignItems: 'center'
    }
});

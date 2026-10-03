import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

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

import { NavigationContext } from '@react-navigation/native';

import { useTheme } from '../includes/Theme';
import { isWatchDevice } from '../includes/Device';

import useRotaryScroll from './watch/useRotaryScroll';
import useWebKeyboardScroll from './layout/useWebKeyboardScroll';

export const isWatch = () => isWatchDevice();

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

// Max content widths (dp) for AppScreen's `contentWidth` and for custom large-screen layouts.
export const CONTENT_WIDTHS = {
    narrow: 680,  // forms and settings
    normal: 720,  // default screens (only applied on tablet/expanded widths)
    wide:   800,  // long-form reading (About)
    split:  1200, // master/detail shells
    shell:  1280  // whole app shell (navigation rail + content) on desktop
};

export const SHORT_HEIGHT_MAX   = 480;
export const EXPANDED_WIDTH_MIN = 840;
export const MEDIUM_WIDTH_MIN   = 600;

export function useResponsiveMetrics() {
    const { width, height } = useWindowDimensions();
    const shortestSide = Math.min(width, height);
    const longestSide = Math.max(width, height);
    const fontScale = PixelRatio.getFontScale();
    const watch = isWatchDevice({ width, height });
    const tablet = !watch && shortestSide >= 600;
    const twoPane = tablet && width >= 720;
    const expanded = !watch && width >= EXPANDED_WIDTH_MIN;
    const shortHeight = !watch && height <= SHORT_HEIGHT_MAX;
    const roundTopInset = watch ? clamp(shortestSide * 0.035, 8, 18) : 0;
    const roundBottomInset = 0;
    const roundFlowWidth = watch ? clamp(shortestSide * 0.92, 190, 420) : width;
    const contentMaxWidth = tablet ? 720 : undefined;
    const wideContentMaxWidth = tablet ? 1040 : undefined;
    const tabletPaneGap = tablet ? 16 : 0;
    const tabletMasterWidth = tablet ? clamp(width * 0.36, 280, 360) : undefined;
    const splitMasterWidth = watch ? undefined : clamp(width * 0.38, 280, 420);

    // Max width for a `contentWidth` kind ('narrow' | 'normal' | 'wide' | 'split' | 'shell' | 'full').
    // Returns undefined when the content should use the full available width.
    const maxContentWidth = (kind = 'normal') => {
        if (watch || kind === 'full') { return undefined; }
        if (kind === 'normal') { return (tablet || expanded) ? CONTENT_WIDTHS.normal : undefined; }

        return CONTENT_WIDTHS[kind];
    };

    return {
        width,
        height,
        shortestSide,
        longestSide,
        fontScale,
        isCompact: shortestSide <= 430,
        isTablet: tablet,
        isTwoPane: twoPane,
        isWatch: watch,
        // Height axis: phone landscape and other short windows (≤ 480 dp tall, never on watches).
        isShortHeight: shortHeight,
        // Material window size classes on the width axis.
        isExpanded: expanded,
        isLandscape: width > height,
        widthClass: watch ? 'watch' : (expanded ? 'expanded' : (width >= MEDIUM_WIDTH_MIN ? 'medium' : 'compact')),
        // The app shell shows a NavigationRail (and hides the compact top-bar overflow menu).
        hasNavigationRail: expanded && !shortHeight,
        layoutClass: watch ? 'watch' : (tablet ? 'tablet' : 'phone'),
        contentMaxWidth,
        wideContentMaxWidth,
        maxContentWidth,
        tabletPaneGap,
        tabletMasterWidth,
        splitMasterWidth,
        roundInset: roundTopInset,
        roundTopInset,
        roundBottomInset,
        roundFlowWidth,
        roundSafeWidth: roundFlowWidth,
        scaledFont: (base, min, max) => clamp(base * fontScale, min, max)
    };
}

// Like useIsFocused(), but safe outside a navigator (treated as focused).
export function useOptionalIsFocused() {
    const navigation = useContext(NavigationContext);
    const [ focused, setFocused ] = useState(() => (navigation?.isFocused ? navigation.isFocused() : true));

    useEffect(() => {
        if (!navigation?.addListener) { return undefined; }

        setFocused(navigation.isFocused());

        const unsubscribeFocus = navigation.addListener('focus', () => setFocused(true));
        const unsubscribeBlur = navigation.addListener('blur', () => setFocused(false));

        return () => {
            unsubscribeFocus();
            unsubscribeBlur();
        };
    }, [ navigation ]);

    return focused;
}

/**
 * Screen frame. Bounded on every platform (flex:1 + minHeight:0) so its ScrollView — or the
 * scrollables a `scroll={false}` screen renders — always scroll, including Expo web.
 *
 * @param {object}  props
 * @param {boolean} [props.scroll=true]          Wrap children in a vertical ScrollView. With
 *        `false`, children get a bounded `flex:1` box and must scroll themselves (e.g. TwoPane).
 * @param {'narrow'|'normal'|'wide'|'split'|'full'} [props.contentWidth='normal']
 *        Centered max width on large screens: narrow ≈680 (Settings), normal 720 (tablet+ only),
 *        wide ≈800 (About), split 1200 (master/detail), full = no limit.
 * @param {Function} [props.onScroll]            Composed with the rotary-input tracker.
 * @param {React.RefObject} [props.scrollRef]    Optional external ref to the ScrollView.
 */
export function AppScreen({ children, scroll = true, contentStyle, style, onScroll, contentWidth = 'normal', scrollRef: externalScrollRef }) {
    const { theme } = useTheme();
    const responsive = useResponsiveMetrics();
    const horizontalPadding = responsive.isWatch ? 0 : (responsive.isTablet ? theme.spacing.xl : theme.spacing.lg);
    const scrollY = useRef(new Animated.Value(0)).current;
    const internalScrollRef = useRef(null);
    const scrollRef = externalScrollRef || internalScrollRef;
    const [ viewportHeight, setViewportHeight ] = useState(0);
    const [ contentHeight, setContentHeight ] = useState(0);
    const [ scrollOffset, setScrollOffset ] = useState(0);
    const isScreenFocused = useOptionalIsFocused();
    const rotary = useRotaryScroll(scrollRef, { enabled: responsive.isWatch && scroll && isScreenFocused });

    useWebKeyboardScroll(scrollRef, { enabled: scroll });

    const selectedContentMaxWidth = responsive.maxContentWidth(contentWidth);

    const frameStyle = [
        styles.screen,
        {
            backgroundColor: theme.background,
            paddingHorizontal: horizontalPadding,
            paddingTop: responsive.isWatch ? responsive.roundTopInset : (responsive.isShortHeight ? theme.spacing.sm : theme.spacing.lg),
            paddingBottom: responsive.isWatch ? responsive.roundBottomInset : (scroll ? 0 : theme.spacing.lg)
        },
        style
    ];
    const boundedContentStyle = responsive.isWatch || selectedContentMaxWidth
        ? {
            width: '100%',
            maxWidth: responsive.isWatch ? responsive.roundFlowWidth : selectedContentMaxWidth,
            alignSelf: 'center'
        }
        : undefined;
    const shouldWrapContent = Boolean(boundedContentStyle);

    const metrics = {
        enabled: responsive.isWatch && scroll,
        scrollY,
        viewportHeight
    };
    const shouldShowWatchScrollIndicator = responsive.isWatch && contentHeight > viewportHeight + 4;
    const handleScroll = event => {
        if (responsive.isWatch) { setScrollOffset(event.nativeEvent.contentOffset.y); }
        if (rotary?.onScroll) { rotary.onScroll(event); }
        if (onScroll) { onScroll(event); }
    };

    if (!scroll) {
        return (
            <SafeAreaView style={frameStyle}>
                <WatchScrollMetricsContext.Provider value={{ ...metrics, enabled: false }}>
                    <View style={[ styles.fullHeight, boundedContentStyle, contentStyle ]}>{children}</View>
                </WatchScrollMetricsContext.Provider>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={frameStyle}>
            <WatchScrollMetricsContext.Provider value={metrics}>
                <Animated.ScrollView
                    ref={scrollRef}
                    style={styles.scroll}
                    onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
                    onScroll={Animated.event(
                        [ { nativeEvent: { contentOffset: { y: scrollY } } } ],
                        { useNativeDriver: Platform.OS !== 'web', listener: handleScroll }
                    )}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                    persistentScrollbar={Platform.OS === 'android' && responsive.isWatch}
                    onContentSizeChange={(_, height) => setContentHeight(height)}
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingBottom: responsive.isWatch ? responsive.roundBottomInset : theme.spacing.xl },
                        shouldWrapContent ? undefined : contentStyle
                    ]}
                >
                    {shouldWrapContent ? <View style={[ boundedContentStyle, contentStyle ]}>{children}</View> : children}
                </Animated.ScrollView>
                {shouldShowWatchScrollIndicator ? (
                    <WatchArcScrollIndicator
                        contentHeight={contentHeight}
                        responsive={responsive}
                        scrollOffset={scrollOffset}
                        theme={theme}
                        viewportHeight={viewportHeight}
                    />
                ) : null}
            </WatchScrollMetricsContext.Provider>
        </SafeAreaView>
    );
}

function SplitPane({ children, scroll, style, contentStyle, scrollRef: externalScrollRef, onScroll, accessibilityLabel }) {
    const internalScrollRef = useRef(null);
    const scrollRef = externalScrollRef || internalScrollRef;

    useWebKeyboardScroll(scrollRef, { enabled: scroll });

    if (!scroll) {
        return (
            <View style={style} accessibilityLabel={accessibilityLabel}>
                <View style={[ styles.paneStatic, contentStyle ]}>{children}</View>
            </View>
        );
    }

    return (
        <View style={style} accessibilityLabel={accessibilityLabel}>
            <ScrollView
                ref={scrollRef}
                style={styles.paneScroll}
                contentContainerStyle={[ styles.paneScrollContent, contentStyle ]}
                onScroll={onScroll}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
            >
                {children}
            </ScrollView>
        </View>
    );
}

/**
 * Side-by-side master/detail layout whose panes scroll independently (each pane is a bounded
 * `flex:1, minHeight:0` box with its own ScrollView), so scrolling a long list never moves the
 * detail. Render it inside `<AppScreen scroll={false} contentWidth="split">` (or 'full'). It always
 * lays panes out in a row: pick it only when `useResponsiveMetrics()` says there is room
 * (e.g. `isTwoPane`, or `width >= 720` for phone landscape).
 *
 * @param {object}          props
 * @param {React.ReactNode} props.master                 List / navigation pane (left).
 * @param {React.ReactNode} props.detail                 Content pane (right, takes remaining width).
 * @param {number}          [props.masterWidth]          Default `splitMasterWidth` (38% of window, 280–420).
 * @param {number}          [props.gap]                  Space between panes. Default `theme.spacing.lg`.
 * @param {boolean}         [props.masterScroll=true]    Wrap master in its own ScrollView. Pass `false`
 *        when the master already is a FlatList/SectionList (give it `style={{flex:1}}`).
 * @param {boolean}         [props.detailScroll=true]    Same for detail. Pass `false` when the detail
 *        renders its own AppScreen/ScrollView (e.g. embedded NextSchedule) to avoid nesting.
 * @param {boolean}         [props.divider=false]        Hairline between panes.
 * @param {object}          [props.style]                Row container style.
 * @param {object}          [props.masterStyle]          Master pane box (background, radius, padding…).
 * @param {object}          [props.detailStyle]          Detail pane box.
 * @param {object}          [props.masterContentStyle]   Master ScrollView contentContainerStyle.
 * @param {object}          [props.detailContentStyle]   Detail ScrollView contentContainerStyle.
 * @param {React.RefObject} [props.masterScrollRef]      Ref to the master ScrollView (e.g. scrollTo).
 * @param {React.RefObject} [props.detailScrollRef]      Ref to the detail ScrollView.
 * @param {Function}        [props.onMasterScroll]
 * @param {Function}        [props.onDetailScroll]
 * @param {string}          [props.masterAccessibilityLabel]
 * @param {string}          [props.detailAccessibilityLabel]
 */
export function TwoPane({
    master,
    detail,
    masterWidth,
    gap,
    masterScroll = true,
    detailScroll = true,
    divider = false,
    style,
    masterStyle,
    detailStyle,
    masterContentStyle,
    detailContentStyle,
    masterScrollRef,
    detailScrollRef,
    onMasterScroll,
    onDetailScroll,
    masterAccessibilityLabel,
    detailAccessibilityLabel
}) {
    const { theme } = useTheme();
    const responsive = useResponsiveMetrics();
    const resolvedMasterWidth = masterWidth || responsive.splitMasterWidth || 320;
    const resolvedGap = typeof(gap) === 'number' ? gap : theme.spacing.lg;

    return (
        <View style={[ styles.split, { gap: resolvedGap }, style ]}>
            <SplitPane
                scroll={masterScroll}
                scrollRef={masterScrollRef}
                onScroll={onMasterScroll}
                accessibilityLabel={masterAccessibilityLabel}
                style={[ styles.masterPane, { width: resolvedMasterWidth }, masterStyle ]}
                contentStyle={masterContentStyle}
            >
                {master}
            </SplitPane>
            {divider ? <View style={[ styles.splitDivider, { backgroundColor: theme.roles.outlineVariant } ]} /> : null}
            <SplitPane
                scroll={detailScroll}
                scrollRef={detailScrollRef}
                onScroll={onDetailScroll}
                accessibilityLabel={detailAccessibilityLabel}
                style={[ styles.detailPane, detailStyle ]}
                contentStyle={detailContentStyle}
            >
                {detail}
            </SplitPane>
        </View>
    );
}

// Alias kept for readers who look for the Material name.
export const AppSplitView = TwoPane;

/**
 * Feeds `WatchScaleItem` and `WatchArcScrollIndicator` from a screen's own scrollable (e.g. a
 * SectionList inside `<AppScreen scroll={false}>`). Spread the returned handlers on the list and
 * wrap its items with `<WatchScrollProvider tracker={tracker}>`.
 *
 * With `useNativeDriver` (default on native) `onScroll` is an `Animated.event`, so the list must
 * be an Animated component (`Animated.ScrollView`, `Animated.FlatList`,
 * `Animated.createAnimatedComponent(SectionList)`). Pass `{ useNativeDriver: false }` to use a
 * plain list (JS-driven, slightly less smooth).
 *
 * @param {object}   [options]
 * @param {boolean}  [options.enabled=isWatch]   Scale/fade items (WatchScaleItem) while true.
 * @param {Function} [options.onScroll]          Extra listener, called with every scroll event
 *        (e.g. the `onScroll` returned by useRotaryScroll).
 * @param {boolean}  [options.useNativeDriver=Platform.OS !== 'web']
 * @returns {{ enabled: boolean, scrollY: Animated.Value, scrollOffset: number, viewportHeight: number,
 *            contentHeight: number, showIndicator: boolean, onScroll: Function,
 *            onLayout: Function, onContentSizeChange: Function, scrollEventThrottle: number }}
 */
export function useWatchScrollTracker({ enabled, onScroll, useNativeDriver = Platform.OS !== 'web' } = {}) {
    const responsive = useResponsiveMetrics();
    const isEnabled = typeof(enabled) === 'boolean' ? enabled : responsive.isWatch;
    const scrollY = useRef(new Animated.Value(0)).current;
    const [ viewportHeight, setViewportHeight ] = useState(0);
    const [ contentHeight, setContentHeight ] = useState(0);
    const [ scrollOffset, setScrollOffset ] = useState(0);
    const onScrollRef = useRef(onScroll);

    onScrollRef.current = onScroll;

    const listener = event => {
        if (isEnabled) { setScrollOffset(event.nativeEvent.contentOffset.y); }
        if (onScrollRef.current) { onScrollRef.current(event); }
    };

    const handleScroll = useNativeDriver
        ? Animated.event([ { nativeEvent: { contentOffset: { y: scrollY } } } ], { useNativeDriver: true, listener })
        : event => {
            scrollY.setValue(event.nativeEvent.contentOffset.y);
            listener(event);
        };

    return {
        enabled: isEnabled,
        scrollY,
        scrollOffset,
        viewportHeight,
        contentHeight,
        showIndicator: isEnabled && contentHeight > viewportHeight + 4,
        onScroll: handleScroll,
        onLayout: event => setViewportHeight(event.nativeEvent.layout.height),
        onContentSizeChange: (_, height) => setContentHeight(height),
        scrollEventThrottle: 16
    };
}

/**
 * Provides the scroll metrics read by `WatchScaleItem` descendants.
 *
 * @param {object} props
 * @param {ReturnType<typeof useWatchScrollTracker>} props.tracker
 */
export function WatchScrollProvider({ tracker, children }) {
    const value = {
        enabled: Boolean(tracker?.enabled),
        scrollY: tracker?.scrollY || null,
        viewportHeight: tracker?.viewportHeight || 0
    };

    return <WatchScrollMetricsContext.Provider value={value}>{children}</WatchScrollMetricsContext.Provider>;
}

/**
 * Curved scroll indicator hugging the right edge of a round watch face. Render it as a sibling
 * after the scrollable (absolute-fill overlay, pointerEvents none), usually only when
 * `tracker.showIndicator`.
 *
 * @param {object} props
 * @param {number} props.contentHeight   Total scrollable content height.
 * @param {number} props.viewportHeight  Visible height of the scrollable.
 * @param {number} props.scrollOffset    Current vertical offset.
 * @param {object} [props.responsive]    useResponsiveMetrics() result (read internally if omitted).
 * @param {object} [props.theme]         App theme (read internally if omitted).
 */
export function WatchArcScrollIndicator(props) {
    const { theme: contextTheme } = useTheme();
    const contextResponsive = useResponsiveMetrics();

    return (
        <WatchArcScrollIndicatorView
            {...props}
            responsive={props.responsive || contextResponsive}
            theme={props.theme || contextTheme}
        />
    );
}

function WatchArcScrollIndicatorView({ contentHeight, responsive, scrollOffset, theme, viewportHeight }) {
    const segmentCount = 72;
    const thumbSegmentMin = 8;
    const arcStartDegrees = -62;
    const arcEndDegrees = 62;
    const centerX = responsive.width / 2;
    const centerY = responsive.height / 2;
    const segmentWidth = 3;
    const segmentHeight = 8;
    const radius = (responsive.shortestSide / 2) - (segmentWidth / 2);
    const maxScrollY = Math.max(1, contentHeight - viewportHeight);
    const scrollProgress = clamp(scrollOffset / maxScrollY, 0, 1);
    const visibleRatio = clamp(viewportHeight / Math.max(1, contentHeight), 0.16, 0.9);
    const thumbSegmentCount = clamp(segmentCount * visibleRatio, thumbSegmentMin, segmentCount);
    const maxThumbStart = segmentCount - thumbSegmentCount;
    const thumbStart = scrollProgress * maxThumbStart;
    const thumbEnd = thumbStart + thumbSegmentCount;
    const trackOpacity = 0.06;
    const thumbOpacity = 0.58;

    return (
        <View pointerEvents="none" style={styles.watchArcScrollIndicator}>
            {Array.from({ length: segmentCount }, (_, index) => {
                const progress = segmentCount === 1 ? 0 : index / (segmentCount - 1);
                const degrees = arcStartDegrees + ((arcEndDegrees - arcStartDegrees) * progress);
                const radians = (degrees * Math.PI) / 180;
                const segmentStart = index;
                const segmentEnd = index + 1;
                const thumbCoverage = clamp(Math.min(segmentEnd, thumbEnd) - Math.max(segmentStart, thumbStart), 0, 1);
                const opacity = trackOpacity + ((thumbOpacity - trackOpacity) * thumbCoverage);

                return (
                    <View
                        key={`watch-scroll-arc-${index}`}
                        style={[
                            styles.watchArcScrollIndicatorSegment,
                            {
                                left: centerX + (Math.cos(radians) * radius) - (segmentWidth / 2),
                                top: centerY + (Math.sin(radians) * radius) - (segmentHeight / 2),
                                width: segmentWidth,
                                height: segmentHeight,
                                backgroundColor: thumbCoverage > 0 ? theme.accent : theme.text,
                                opacity,
                                transform: [ { rotate: `${degrees}deg` } ]
                            }
                        ]}
                    />
                );
            })}
        </View>
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
        minHeight: 0,
        width: '100%'
    },
    scroll: {
        flex: 1,
        minHeight: 0,
        width: '100%'
    },
    fullHeight: {
        flex: 1,
        minHeight: 0
    },
    split: {
        flex: 1,
        minHeight: 0,
        flexDirection: 'row',
        alignItems: 'stretch'
    },
    masterPane: {
        flexGrow: 0,
        flexShrink: 0,
        minHeight: 0
    },
    detailPane: {
        flex: 1,
        minWidth: 0,
        minHeight: 0
    },
    paneScroll: {
        flex: 1,
        minHeight: 0
    },
    paneScrollContent: {
        flexGrow: 1
    },
    paneStatic: {
        flex: 1,
        minHeight: 0
    },
    splitDivider: {
        width: StyleSheet.hairlineWidth,
        alignSelf: 'stretch'
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'stretch',
        justifyContent: 'flex-start'
    },
    watchArcScrollIndicator: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
    },
    watchArcScrollIndicatorSegment: {
        position: 'absolute',
        borderRadius: 999,
        overflow: 'hidden'
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

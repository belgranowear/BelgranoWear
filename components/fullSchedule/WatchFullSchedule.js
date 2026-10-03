import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Animated, StyleSheet, View } from 'react-native';

import { ActivityIndicator, Button, Chip, Text, TouchableRipple } from 'react-native-paper';

import { useIsFocused } from '@react-navigation/native';

import Lang from '../../includes/Lang';
import { isRoundScreen } from '../../includes/Device';
import { useTheme } from '../../includes/Theme';

import * as UI from '../ui';
import CurvedText from '../watch/CurvedText';
import EdgeButton, * as EdgeButtonModule from '../watch/EdgeButton';
import useRotaryScroll from '../watch/useRotaryScroll';

import { STATUS } from './useFullSchedule';
import { durationMinutes, formatTime } from './model';
import { holidayNotice, minutesLabel, segmentLabel, tripA11yLabel, waitLabel } from './labels';

const EDGE_BUTTON_SPACE = 64;

// Agent E's EdgeButton exports `useEdgeButtonMetrics()` (pinned bottom cap + reserved space);
// fall back to a fixed space and our own pinned wrapper with the older stub.
const useEdgeButtonMetrics = EdgeButtonModule.useEdgeButtonMetrics || (() => null);
const EDGE_BUTTON_SELF_PINNED = Boolean(EdgeButtonModule.useEdgeButtonMetrics);

// Scale/opacity by distance to the viewport center (≈ Wear TransformingLazyColumn). Mirrors
// `WatchScaleItem` from components/ui.js, whose scroll context is private to AppScreen's own
// ScrollView; this screen needs its own ScrollView ref for "Ahora" and rotary input.
function TransformItem({ children, scrollY, viewportHeight, onMeasure, style }) {
    const [ center, setCenter ] = useState(null);

    const onLayout = event => {
        const { y, height } = event.nativeEvent.layout;

        setCenter(y + height / 2);
        if (onMeasure) { onMeasure(y); }
    };

    const animatedStyle = useMemo(() => {
        if (center === null || viewportHeight <= 0) { return null; }

        const edge     = Math.max(1, viewportHeight * 0.52);
        const band     = edge * 0.34;
        const distance = Animated.subtract(center, Animated.add(scrollY, viewportHeight / 2));

        return {
            opacity: distance.interpolate({
                inputRange:  [ -edge, -band, 0, band, edge ],
                outputRange: [ 0.46, 0.92, 1, 0.92, 0.46 ],
                extrapolate: 'clamp'
            }),
            transform: [ {
                scale: distance.interpolate({
                    inputRange:  [ -edge, -band, 0, band, edge ],
                    outputRange: [ 0.72, 0.98, 1, 0.98, 0.72 ],
                    extrapolate: 'clamp'
                })
            } ]
        };
    }, [ center, scrollY, viewportHeight ]);

    return <Animated.View onLayout={onLayout} style={[ styles.transformItem, style, animatedStyle ]}>{children}</Animated.View>;
}

/**
 * Watch layout of F3 (round 192/227 dp and square 200 dp): curved route title, a single
 * chip that cycles Háb./Sáb./Dom-Fer, a transforming list grouped by hour with the "Ahora"
 * line, and an EdgeButton that jumps to the next train (or back to today's timetable).
 */
export default function WatchFullSchedule({ params, schedule, onOpenTrip }) {
    const { theme }  = useTheme();
    const responsive = UI.useResponsiveMetrics();
    const isFocused  = useIsFocused();
    const round      = isRoundScreen({ width: responsive.width, height: responsive.height, watch: true });

    const scrollRef        = useRef(null);
    const scrollY          = useRef(new Animated.Value(0)).current;
    const nowYRef          = useRef(null);
    const pendingScrollRef = useRef(true);
    const [ viewportHeight, setViewportHeight ] = useState(0);
    const [ contentHeight, setContentHeight ]   = useState(0);

    const rotary        = useRotaryScroll(scrollRef, { enabled: responsive.isWatch && isFocused });
    const edgeMetrics   = useEdgeButtonMetrics();
    const reservedSpace = edgeMetrics?.reservedSpace || EDGE_BUTTON_SPACE;

    const { sections, status, isToday, segments } = schedule;
    const sidePadding = round ? Math.round(responsive.shortestSide * 0.1) : 8;
    const topPadding  = responsive.roundTopInset + 22;

    const entries = useMemo(() => {
        const list = [];

        sections.forEach(section => {
            list.push({ type: 'hour', key: section.key, title: section.title });
            section.data.forEach(item => list.push(item));
        });

        return list;
    }, [ sections ]);

    const scrollToNow = useCallback((animated = true) => {
        if (!scrollRef.current || nowYRef.current === null) { return; }

        scrollRef.current.scrollTo({ y: Math.max(0, nowYRef.current - viewportHeight * 0.3), animated });
    }, [ viewportHeight ]);

    useEffect(() => {
        nowYRef.current = null;
    }, [ sections ]);

    const onNowMeasured = y => {
        nowYRef.current = y;

        if (pendingScrollRef.current && viewportHeight > 0) {
            pendingScrollRef.current = false;
            setTimeout(() => scrollToNow(false), 0);
        }
    };

    const cycleSegment = () => {
        if (segments.length < 2) { return; }

        const index = segments.findIndex(segment => segment.id === schedule.selectedSegmentId);
        const next  = segments[(index + 1) % segments.length];

        pendingScrollRef.current = next.id === schedule.todaySegmentId;
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        schedule.setSelectedSegmentId(next.id);
    };

    const onEdgePress = () => {
        if (!isToday) {
            pendingScrollRef.current = true;
            schedule.setSelectedSegmentId(schedule.todaySegmentId);
            return;
        }

        scrollToNow(true);
    };

    const onScroll = Animated.event(
        [ { nativeEvent: { contentOffset: { y: scrollY } } } ],
        {
            useNativeDriver: true,
            listener: event => {
                if (rotary?.onScroll) { rotary.onScroll(event); }
            }
        }
    );

    const notice = holidayNotice(schedule.today);
    const ArcIndicator = UI.WatchArcScrollIndicator;
    // The top arc only fits ~15 glyphs on a round face, so it shows just the destination there.
    const routeTitle   = round
        ? `→ ${params.destination?.title || ''}`
        : `${params.origin?.title || ''} → ${params.destination?.title || ''}`;

    const renderEntry = entry => {
        if (entry.type === 'hour') {
            return (
                <TransformItem key={entry.key} scrollY={scrollY} viewportHeight={viewportHeight}>
                    <Text variant="labelLarge" accessibilityRole="header" style={[ styles.hour, theme.type.emphasized.label, { color: theme.textMuted } ]}>
                        {entry.title}
                    </Text>
                </TransformItem>
            );
        }

        if (entry.type === 'now') {
            return (
                <TransformItem key={entry.key} scrollY={scrollY} viewportHeight={viewportHeight} onMeasure={onNowMeasured}>
                    <View style={styles.nowRow} accessible accessibilityLabel={`${Lang.t('fullScheduleNow')} ${formatTime(schedule.now)}`}>
                        <View style={[ styles.nowDot, { backgroundColor: theme.accent } ]} />
                        <Text variant="labelMedium" style={[ theme.type.emphasized.label, { color: theme.accent } ]}>{Lang.t('fullScheduleNow')}</Text>
                        <View style={[ styles.nowLine, { backgroundColor: theme.accent } ]} />
                    </View>
                </TransformItem>
            );
        }

        const { trip, isPast, isNext } = entry;
        const minutes  = durationMinutes(trip);
        const trailing = isPast
            ? Lang.t('fullSchedulePast')
            : (isToday ? waitLabel(trip, schedule.now) : (minutes !== null ? minutesLabel(minutes) : ''));

        return (
            <TransformItem key={entry.key} scrollY={scrollY} viewportHeight={viewportHeight}>
                <TouchableRipple
                    onPress={() => onOpenTrip(trip)}
                    accessibilityRole="button"
                    accessibilityLabel={tripA11yLabel(entry)}
                    accessibilityHint={Lang.t('fullScheduleRowHint')}
                    borderless
                    style={[
                        styles.row,
                        { borderRadius: theme.shape.xl, backgroundColor: isNext ? theme.roles.primaryContainer : theme.roles.surfaceContainer },
                        isPast ? styles.past : null
                    ]}
                >
                    <View style={styles.rowInner}>
                        <Text
                            style={[
                                styles.rowTime,
                                theme.type.emphasized.title,
                                { color: isNext ? theme.roles.onPrimaryContainer : theme.text },
                                isPast ? styles.strike : null
                            ]}
                        >
                            {formatTime(trip.departure)}
                        </Text>
                        <Text
                            numberOfLines={1}
                            style={[ styles.rowTrailing, { color: isNext ? theme.roles.onPrimaryContainer : theme.textMuted }, isPast ? styles.strike : null ]}
                        >
                            {trailing}
                        </Text>
                    </View>
                </TouchableRipple>
            </TransformItem>
        );
    };

    let body;

    if (status === STATUS.LOADING) {
        body = <ActivityIndicator style={styles.state} />;
    } else if (status === STATUS.ERROR) {
        body = (
            <View style={styles.state}>
                <Text style={[ styles.stateText, { color: theme.text } ]}>{Lang.t('fullScheduleErrorTitle')}</Text>
                <Button mode="contained-tonal" compact icon="refresh" onPress={schedule.reload}>{Lang.t('fullScheduleRetry')}</Button>
            </View>
        );
    } else if (entries.length === 0) {
        body = <Text style={[ styles.state, styles.stateText, { color: theme.textMuted } ]}>{Lang.t('fullScheduleEmptyTitle')}</Text>;
    } else {
        body = entries.map(renderEntry);
    }

    const edgeButton = (
        <EdgeButton
            label={isToday ? Lang.t('fullScheduleNow') : Lang.t('fullScheduleGoToToday')}
            icon={isToday ? 'clock-outline' : 'calendar-today'}
            onPress={onEdgePress}
            accessibilityLabel={isToday ? Lang.t('fullScheduleGoToNow') : Lang.t('fullScheduleGoToToday')}
        />
    );

    const showEdgeButton = status === STATUS.READY && entries.length > 0 && Boolean(schedule.todaySegmentId);

    return (
        <UI.AppScreen scroll={false} contentStyle={styles.fill}>
            <View style={styles.fill}>
                <Animated.ScrollView
                    ref={scrollRef}
                    style={styles.fill}
                    onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
                    onContentSizeChange={(_, height) => setContentHeight(height)}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingTop:        topPadding,
                        paddingBottom:     reservedSpace + Math.round(viewportHeight * 0.25),
                        paddingHorizontal: sidePadding,
                        gap:               4
                    }}
                >
                    <View style={styles.segmentRow}>
                        <Chip
                            compact
                            icon="swap-horizontal"
                            onPress={cycleSegment}
                            disabled={segments.length < 2}
                            accessibilityLabel={Lang.t('fullScheduleSegmentSelectorA11y', { segment: segmentLabel(schedule.selectedSegment) })}
                            style={{ backgroundColor: theme.roles.secondaryContainer }}
                            textStyle={[ theme.type.emphasized.label, { color: theme.roles.onSecondaryContainer } ]}
                        >
                            {segmentLabel(schedule.selectedSegment, true)}
                        </Chip>
                    </View>
                    {notice ? (
                        <Text style={[ styles.notice, { color: theme.warning } ]} numberOfLines={2}>{notice}</Text>
                    ) : null}
                    {body}
                </Animated.ScrollView>

                <View pointerEvents="none" style={[ styles.titleBar, round ? styles.titleBarRound : { top: responsive.roundTopInset }, { backgroundColor: theme.background } ]}>
                    <CurvedText text={routeTitle} position="top" fontSize={12} color={theme.textMuted} />
                </View>

                {showEdgeButton && EDGE_BUTTON_SELF_PINNED ? edgeButton : null}
                {showEdgeButton && !EDGE_BUTTON_SELF_PINNED ? <View style={styles.edgeButton}>{edgeButton}</View> : null}

                {ArcIndicator && contentHeight > viewportHeight + 4 ? (
                    <ArcIndicator
                        contentHeight={contentHeight}
                        responsive={responsive}
                        scrollY={scrollY}
                        theme={theme}
                        viewportHeight={viewportHeight}
                    />
                ) : null}
            </View>
        </UI.AppScreen>
    );
}

const styles = StyleSheet.create({
    fill: {
        flex: 1,
        minHeight: 0
    },
    transformItem: {
        width: '100%',
        alignSelf: 'stretch'
    },
    titleBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 20,
        justifyContent: 'center',
        paddingHorizontal: 24
    },
    // CurvedText sizes its arc from the screen radius, so on round faces it must start at the very top.
    titleBarRound: {
        top:               0,
        height:            undefined,
        paddingHorizontal: 0,
        alignItems:        'center'
    },
    segmentRow: {
        alignItems: 'center',
        marginBottom: 4
    },
    notice: {
        fontSize: 11,
        textAlign: 'center'
    },
    hour: {
        paddingHorizontal: 8,
        paddingTop: 6
    },
    nowRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 18
    },
    nowDot: {
        width: 6,
        height: 6,
        borderRadius: 3
    },
    nowLine: {
        flex: 1,
        height: 2,
        borderRadius: 1
    },
    row: {
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: 12
    },
    rowInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8
    },
    rowTime: {
        fontSize: 17,
        fontVariant: [ 'tabular-nums' ]
    },
    rowTrailing: {
        flexShrink: 1,
        fontSize: 12,
        textAlign: 'right',
        fontVariant: [ 'tabular-nums' ]
    },
    past: {
        opacity: 0.55
    },
    strike: {
        textDecorationLine: 'line-through'
    },
    state: {
        alignItems: 'center',
        gap: 8,
        paddingVertical: 16
    },
    stateText: {
        textAlign: 'center',
        fontSize: 13
    },
    edgeButton: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'stretch'
    }
});

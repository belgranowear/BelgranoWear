import React, { useEffect, useRef, useState } from 'react';

import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from 'react-native-paper';

import { useIsFocused } from '@react-navigation/native';

import Lang from '../includes/Lang';
import LiveTrip from '../includes/LiveTrip';
import { isRoundScreen } from '../includes/Device';
import { isSameArgentinaDay } from '../includes/Schedule';
import { nowInArgentina } from '../includes/Time';
import { useTheme } from '../includes/Theme';
import { buildStops, summarizeTrip, tripPhase, wallTextOf } from '../includes/TripTimes';

import FreshnessChip from './FreshnessChip';
import RouteHeader from './RouteHeader';
import StopTimeline from './trip/StopTimeline';
import TripSummary, { describeSummary } from './trip/TripSummary';
import useTripDetail from './trip/useTripDetail';
import CurvedText from './watch/CurvedText';
import EdgeFade from './watch/EdgeFade';
import EdgeButton, * as EdgeButtonModule from './watch/EdgeButton';
import useRotaryScroll from './watch/useRotaryScroll';
import * as UI from './ui';
import { AppScreen, EmptyState, SectionHeader, TransitCard, useResponsiveMetrics } from './ui';

const SHORT_HEIGHT_MAX     = 480;
const WIDE_TWO_COLUMN_MIN  = 900;
const WATCH_COLLAPSE_ABOVE = 4;

// `useEdgeButtonMetrics` ships with the watch primitives; fall back to no reserved space
// while only the contract stub is present (resolved once per module, so hook order is stable).
const useEdgeButtonMetrics = EdgeButtonModule.useEdgeButtonMetrics || (() => ({ reservedSpace: 0 }));

// Watch scroll tracking (arc indicator) from the layout area; no-op until it lands.
const useWatchScrollTracker = UI.useWatchScrollTracker || (() => null);
const WatchArcScrollIndicator = UI.WatchArcScrollIndicator || null;

// Upstream stations (dimmed) + "Tren aprox." marker, from the live position estimate.
const buildUpstreamEntries = (live, titles) => {
    const position = live?.position;
    const deltas   = live?.deltas || [];

    if (!position || deltas.length === 0) { return []; }

    const count = position.kind === 'beyond'
        ? deltas.length
        : Math.max(1, deltas.findIndex(delta => delta.id === position.behindId) + 1);

    const upstream = deltas.slice(0, count).reverse().map(delta => ({
        type:     'stop',
        role:     'upstream',
        id:       delta.id,
        title:    titles[delta.id] || String(delta.id),
        timeText: delta.departureText,
        state:    delta.departureText ? 'ok' : 'missing',
        isPast:   false
    }));

    const marker = {
        type:  'marker',
        label: position.kind === 'beyond'
            ? Lang.t('tripTrainBeyond', { station: upstream[0]?.title || '' })
            : Lang.t(position.kind === 'arriving' ? 'tripTrainArriving' : 'tripTrainHere')
    };

    return position.kind === 'beyond' ? [ marker, ...upstream ] : [ upstream[0], marker, ...upstream.slice(1) ];
};

const buildWatchEntries = (stops, live, expanded, onExpand) => {
    const entries = live?.position ? [ { type: 'marker', label: Lang.t('tripTrainShort') } ] : [];
    const asStops = stops.map(stop => ({ type: 'stop', ...stop }));

    if (expanded || asStops.length <= WATCH_COLLAPSE_ABOVE) { return [ ...entries, ...asStops ]; }

    return [
        ...entries,
        asStops[0],
        asStops[1],
        { type: 'collapsed', count: asStops.length - 3, onPress: onExpand },
        asStops[asStops.length - 1]
    ];
};

/**
 * F4: one trip end to end — departure, arrival, duration, stops and per-station times.
 *
 * Route params: `{ origin, destination, segmentsList, holidaysList, departure?:number(ms) }` (departure defaults to the next one).
 */
export default function TripDetail({ route }) {
    const { origin, destination, segmentsList, holidaysList, departure } = route?.params || {};

    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const isFocused  = useIsFocused();
    const scrollRef  = useRef(null);

    const [ expanded,  setExpanded ]  = useState(false);
    const [ following, setFollowing ] = useState(false);

    const detail = useTripDetail({ origin, destination, segmentsList, holidaysList, departure });
    const rotary = useRotaryScroll(scrollRef, { enabled: responsive.isWatch && isFocused });
    const edge   = useEdgeButtonMetrics();
    // Plain ScrollView below, so the tracker must not use the native driver.
    const tracker = useWatchScrollTracker({ enabled: responsive.isWatch, onScroll: rotary?.onScroll, useNativeDriver: false });

    const canFollow = LiveTrip.isAvailable();

    useEffect(() => {
        if (!canFollow) { return; }

        let cancelled = false;

        LiveTrip.getActive().then(active => {
            if (cancelled || !active || !detail.trip) { return; }

            setFollowing(
                String(active.origin?.id) === String(origin?.id) &&
                String(active.destination?.id) === String(destination?.id) &&
                active.departure === detail.trip.departure.valueOf()
            );
        }).catch(() => {});

        return () => { cancelled = true; };
    }, [ canFollow, detail.trip ]);

    const toggleFollow = async () => {
        if (!detail.trip) { return; }

        if (following) {
            if (await LiveTrip.stop()) { setFollowing(false); }
            return;
        }

        const started = await LiveTrip.start({
            origin:      { id: parseInt(origin.id, 10), title: origin.title },
            destination: { id: parseInt(destination.id, 10), title: destination.title },
            departure:   detail.trip.departure.valueOf(),
            arrival:     detail.trip.arrival ? detail.trip.arrival.valueOf() : null,
            source:      detail.source
        });

        setFollowing(Boolean(started));
    };

    const routeTitles = {
        ...detail.titles,
        ...(origin?.title ? { [parseInt(origin.id, 10)]: origin.title } : {}),
        ...(destination?.title ? { [parseInt(destination.id, 10)]: destination.title } : {})
    };

    const stops   = buildStops({ stationIds: detail.stationIds, titles: routeTitles, trip: detail.trip, passTexts: detail.passTexts, nowMs: detail.nowMs });
    const summary = summarizeTrip(detail.trip, detail.stationIds);
    const phase   = tripPhase(detail.trip, detail.nowMs);

    const departureText = detail.trip ? wallTextOf(detail.trip.departure) : null;
    const arrivalText   = detail.trip?.arrival ? wallTextOf(detail.trip.arrival) : null;
    const liveDeparture = detail.live?.liveDeparture;
    const liveDepartureText = liveDeparture && detail.trip && Math.abs(liveDeparture.valueOf() - detail.trip.departure.valueOf()) >= 60000
        ? wallTextOf(liveDeparture)
        : null;

    const isTomorrow = detail.trip && phase === 'upcoming' && !isSameArgentinaDay(detail.trip.departure, nowInArgentina());
    const phaseLabel = phase === 'inProgress'
        ? Lang.t('tripPhaseInProgress')
        : (phase === 'finished' ? Lang.t('tripPhaseFinished') : (isTomorrow ? Lang.t('tripPhaseTomorrow') : null));

    const loadingProgress = detail.progress.total > 0 && detail.progress.done < detail.progress.total
        ? Lang.t('tripLoadingStops', { done: detail.progress.done, total: detail.progress.total })
        : null;

    /* Loading / error / empty */

    if (detail.status !== 'ready') {
        const isLoading = detail.status === 'loading';

        return (
            <AppScreen scroll={false} contentStyle={styles.centered}>
                {isLoading ? (
                    <View style={styles.loading} accessible accessibilityLiveRegion="polite" accessibilityLabel={Lang.t('tripLoading')}>
                        <ActivityIndicator color={theme.accent} />
                        <Text variant="bodyMedium" style={{ color: theme.textMuted, textAlign: 'center' }}>{Lang.t('tripLoading')}</Text>
                    </View>
                ) : (
                    <EmptyState
                        title={Lang.t(detail.status === 'empty' ? 'tripEmptyTitle' : 'tripErrorTitle')}
                        message={Lang.t(detail.status === 'empty' ? 'tripEmptyMessage' : 'tripErrorMessage')}
                        action={<Button mode="contained-tonal" icon="refresh" onPress={detail.retry}>{Lang.t('tripRetry')}</Button>}
                    />
                )}
            </AppScreen>
        );
    }

    /* Watch (round 192/227 dp, square 200 dp) */

    if (responsive.isWatch) {
        const round       = isRoundScreen({ width: responsive.width, height: responsive.height, watch: true });
        const side        = responsive.shortestSide;
        const sidePadding = round ? Math.round(side * 0.1) : 8;
        const entries     = buildWatchEntries(stops, detail.live, expanded, () => setExpanded(true));
        const topBand     = round ? Math.round(side * 0.13) : 20;
        // Like the phone: no "Seguir" for a train that already arrived (but keep "Dejar" if active).
        const showFollow  = canFollow && (phase !== 'finished' || following);

        return (
            <AppScreen scroll={false}>
                <ScrollView
                    ref={scrollRef}
                    style={styles.scroll}
                    contentContainerStyle={[
                        styles.watchContent,
                        {
                            paddingHorizontal: sidePadding,
                            // Room for the pinned time band above the first row.
                            paddingTop:        topBand + (round ? Math.round(side * 0.02) : 4),
                            // Lets the last row scroll up into the widest part of the circle.
                            paddingBottom:     (round ? Math.round(side * 0.2) : 12) + (showFollow ? (edge?.reservedSpace || 0) : 0)
                        }
                    ]}
                    onScroll={tracker?.onScroll || rotary?.onScroll}
                    onLayout={tracker?.onLayout}
                    onContentSizeChange={tracker?.onContentSizeChange}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                >
                    <View
                        accessible
                        accessibilityLabel={describeSummary({ departureText, arrivalText, durationMinutes: summary.durationMinutes, stopsCount: summary.stopsCount })}
                        style={[ styles.watchSummary, round && { paddingHorizontal: Math.round(side * 0.04) } ]}
                    >
                        <Text variant="titleSmall" style={[ styles.centerText, theme.type.emphasized.title, { color: theme.text } ]} numberOfLines={2}>
                            {Lang.t('tripWatchSummary', { departure: departureText, arrival: arrivalText || Lang.t('tripMissingTime') })}
                        </Text>
                        <Text variant="bodySmall" style={[ styles.centerText, { color: theme.textMuted } ]} numberOfLines={1}>
                            {Lang.t(summary.stopsCount === 1 ? 'tripWatchMetaOne' : 'tripWatchMeta', {
                                minutes: Number.isFinite(summary.durationMinutes) ? summary.durationMinutes : Lang.t('tripMissingTime'),
                                stops:   summary.stopsCount
                            })}
                        </Text>
                        <View style={styles.watchChips}>
                            <FreshnessChip source={detail.source} fetchedAt={detail.fetchedAt} compact />
                        </View>
                        {phaseLabel ? <Text variant="labelSmall" style={[ styles.centerText, { color: theme.accent } ]}>{phaseLabel}</Text> : null}
                    </View>
                    <StopTimeline entries={entries} compact />
                    {loadingProgress ? <Text variant="labelSmall" style={[ styles.centerText, { color: theme.textMuted } ]}>{loadingProgress}</Text> : null}
                    {expanded && stops.length > WATCH_COLLAPSE_ABOVE ? (
                        <Button compact mode="text" onPress={() => setExpanded(false)} style={styles.watchToggle}>{Lang.t('tripShowLess')}</Button>
                    ) : null}
                </ScrollView>
                {/* Pinned time: stops dissolve under it instead of showing around the curved text. */}
                <EdgeFade edge="top" solid={topBand} fade={16} color={theme.background} />
                <View pointerEvents="none" style={styles.watchTimeBand}>
                    <CurvedText text={wallTextOf(nowInArgentina())} position="top" />
                </View>
                {tracker?.showIndicator && WatchArcScrollIndicator ? (
                    <WatchArcScrollIndicator
                        contentHeight={tracker.contentHeight}
                        viewportHeight={tracker.viewportHeight}
                        scrollY={tracker.scrollY}
                    />
                ) : null}
                {showFollow ? (
                    <EdgeButton
                        label={Lang.t(following ? 'tripStopFollowingShort' : 'tripFollowShort')}
                        icon="train"
                        onPress={toggleFollow}
                    />
                ) : null}
            </AppScreen>
        );
    }

    /* Phone / foldable / tablet / desktop */

    const isShortLandscape = !responsive.isTablet && responsive.width > responsive.height && responsive.height <= SHORT_HEIGHT_MAX;
    const isWideTwoColumn  = responsive.isTablet && responsive.width >= WIDE_TWO_COLUMN_MIN;
    const twoColumns       = isShortLandscape || isWideTwoColumn;

    const upstreamEntries  = buildUpstreamEntries(detail.live, routeTitles);
    const timelineEntries  = [ ...upstreamEntries, ...stops.map(stop => ({ type: 'stop', ...stop })) ];

    const header = (
        <RouteHeader
            origin={origin}
            destination={destination}
            subtitle={detail.segmentName || undefined}
            compact={isShortLandscape}
            style={styles.block}
        />
    );

    const summaryBlock = (
        <>
            {header}
            <TripSummary
                departureText={departureText}
                arrivalText={arrivalText}
                durationMinutes={summary.durationMinutes}
                stopsCount={summary.stopsCount}
                source={detail.source}
                fetchedAt={detail.fetchedAt}
                liveDepartureText={liveDepartureText}
                phaseLabel={phaseLabel}
                stacked={isShortLandscape || responsive.width < 560 || (twoColumns && responsive.width < 1100)}
                style={styles.block}
            />
            {canFollow && phase !== 'finished' ? (
                <Button
                    mode={following ? 'contained-tonal' : 'contained'}
                    icon={following ? 'bell-off-outline' : 'bell-ring-outline'}
                    onPress={toggleFollow}
                    style={[ styles.block, { borderRadius: theme.shape.full } ]}
                    contentStyle={styles.followContent}
                >
                    {Lang.t(following ? 'tripStopFollowing' : 'tripFollow')}
                </Button>
            ) : null}
        </>
    );

    const timelineBlock = (
        <TransitCard style={styles.timelineCard}>
            <SectionHeader
                title={Lang.t('tripStopsTitle')}
                subtitle={loadingProgress || Lang.t('tripTimesNote')}
            />
            <StopTimeline entries={timelineEntries} />
        </TransitCard>
    );

    if (twoColumns) {
        return (
            <AppScreen scroll={false} contentWidth={isWideTwoColumn ? 'wide' : 'full'}>
                <View style={[ styles.columns, { gap: isWideTwoColumn ? 24 : 16 } ]}>
                    <ScrollView
                        style={[ styles.scroll, isWideTwoColumn ? styles.sideColumnWide : styles.sideColumnShort ]}
                        contentContainerStyle={styles.columnContent}
                    >
                        {summaryBlock}
                    </ScrollView>
                    <ScrollView style={styles.scroll} contentContainerStyle={styles.columnContent}>
                        {timelineBlock}
                    </ScrollView>
                </View>
            </AppScreen>
        );
    }

    return (
        <AppScreen scroll={false}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.columnContent}>
                {summaryBlock}
                {timelineBlock}
            </ScrollView>
        </AppScreen>
    );
}

const styles = StyleSheet.create({
    // Bounded scroll containers: required for web, where body never scrolls.
    scroll: {
        flex:      1,
        minHeight: 0
    },
    columns: {
        flex:          1,
        minHeight:     0,
        flexDirection: 'row'
    },
    sideColumnShort: {
        flex: 0.85
    },
    sideColumnWide: {
        flex:     0,
        width:    380,
        flexGrow: 0
    },
    columnContent: {
        paddingBottom: 24
    },
    block: {
        marginBottom: 12
    },
    timelineCard: {
        marginBottom: 0
    },
    followContent: {
        minHeight: 52
    },
    centered: {
        justifyContent: 'center'
    },
    loading: {
        alignItems: 'center',
        gap:        12,
        padding:    16
    },
    centerText: {
        textAlign: 'center'
    },
    watchContent: {
        gap: 6
    },
    watchTimeBand: {
        position:   'absolute',
        top:        0,
        left:       0,
        right:      0,
        alignItems: 'center'
    },
    watchSummary: {
        alignItems: 'center',
        gap:        2
    },
    watchChips: {
        flexDirection:  'row',
        justifyContent: 'center',
        marginTop:      2
    },
    watchToggle: {
        alignSelf: 'center'
    }
});

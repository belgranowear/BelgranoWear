import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { SectionList, StyleSheet, View } from 'react-native';

import { Button, FAB, Icon, SegmentedButtons, Text, TouchableRipple } from 'react-native-paper';

import Lang from '../includes/Lang';
import { useTheme } from '../includes/Theme';

import FreshnessChip from './FreshnessChip';
import RouteHeader from './RouteHeader';
import { AppScreen, EmptyState, TransitCard, useResponsiveMetrics } from './ui';
import LoadingIndicator from './layout/LoadingIndicator';

import { HourHeader, NowDivider, TripRow, getRowMetrics } from './fullSchedule/ScheduleRows';
import WatchFullSchedule from './fullSchedule/WatchFullSchedule';
import useFullSchedule, { STATUS } from './fullSchedule/useFullSchedule';
import { buildFrames, findNowLocation, formatTime } from './fullSchedule/model';
import { formatDate, holidayNotice, segmentLabel, todayLabel, trainCountLabel, minutesLabel } from './fullSchedule/labels';

const TWO_COLUMN_MIN_WIDTH = 900;
const SHORT_HEIGHT_MAX     = 480;

/**
 * F3: full day schedule for a route, grouped by hour, with segment selector and "Ahora".
 *
 * Route params: `{ origin, destination, segmentsList, holidaysList, segmentId? }` (same as NextSchedule).
 * Layouts: phone portrait (summary scrolls with the list), short height / phone landscape
 * (compact header, list fills), tablet & desktop (summary pane left, list right) and watch
 * (`fullSchedule/WatchFullSchedule`).
 */
export default function FullSchedule({ route, navigation }) {
    const params     = route?.params || {};
    const responsive = useResponsiveMetrics();
    const schedule   = useFullSchedule(params);

    const openTrip = useCallback(trip => {
        navigation.navigate('TripDetail', { ...params, departure: trip.departure.valueOf() });
    }, [ navigation, params ]);

    if (responsive.isWatch) {
        return <WatchFullSchedule params={params} schedule={schedule} onOpenTrip={openTrip} />;
    }

    return <PhoneFullSchedule params={params} schedule={schedule} onOpenTrip={openTrip} responsive={responsive} />;
}

function PhoneFullSchedule({ params, schedule, onOpenTrip, responsive }) {
    const { theme } = useTheme();
    const listRef   = useRef(null);
    const pendingScrollRef = useRef(true);
    const [ listHeaderHeight, setListHeaderHeight ] = useState(0);

    const isTwoColumn   = responsive.isTablet && responsive.width >= TWO_COLUMN_MIN_WIDTH;
    const isShortHeight = !isTwoColumn && responsive.height <= SHORT_HEIGHT_MAX;
    const metrics       = useMemo(() => getRowMetrics(responsive.fontScale, isShortHeight), [ responsive.fontScale, isShortHeight ]);
    const hasListHeader = !isTwoColumn && Boolean(schedule.summary);
    const headerOffset  = hasListHeader ? listHeaderHeight : 0;

    const { sections, status, isToday } = schedule;

    const frames = useMemo(() => buildFrames(sections, { ...metrics, headerOffset }), [ sections, metrics, headerOffset ]);
    const getItemLayout = useCallback((_, index) => frames[index] || { length: 0, offset: 0, index }, [ frames ]);

    const scrollToNow = useCallback((animated = true) => {
        const location = findNowLocation(sections);

        if (!listRef.current || !location) { return; }

        // VirtualizedSectionList counts the section header as itemIndex 0.
        listRef.current.scrollToLocation({
            sectionIndex: location.sectionIndex,
            itemIndex:    location.itemIndex + 1,
            viewPosition: 0,
            viewOffset:   metrics.rowHeight,
            animated
        });
    }, [ sections, metrics.rowHeight ]);

    const goToNow = () => {
        if (!isToday) {
            pendingScrollRef.current = true;
            schedule.setSelectedSegmentId(schedule.todaySegmentId);
            return;
        }

        scrollToNow(true);
    };

    // Jump to "Ahora" on first load and after "Ir a ahora" switched back to today's segment.
    useEffect(() => {
        if (status !== STATUS.READY || !isToday || !pendingScrollRef.current || sections.length === 0) { return undefined; }
        if (hasListHeader && listHeaderHeight === 0) { return undefined; }

        pendingScrollRef.current = false;

        const timer = setTimeout(() => scrollToNow(false), 0);

        return () => clearTimeout(timer);
    }, [ status, isToday, sections, hasListHeader, listHeaderHeight, scrollToNow ]);

    const selectSegment = value => {
        pendingScrollRef.current = value === schedule.todaySegmentId;
        schedule.setSelectedSegmentId(value);
    };

    const nowLabel = schedule.nextIndex >= schedule.trips.length && schedule.trips.length > 0
        ? Lang.t('fullScheduleNoMoreToday')
        : null;

    const renderItem = ({ item }) => {
        if (item.type === 'now') {
            return <NowDivider now={schedule.now} height={metrics.nowHeight} theme={theme} label={nowLabel} />;
        }

        return <TripRow item={item} now={schedule.now} height={metrics.rowHeight} theme={theme} onPress={onOpenTrip} showWait={isToday} />;
    };

    const controls = (
        <ScheduleControls
            schedule={schedule}
            params={params}
            theme={theme}
            compact={isShortHeight}
            onSelectSegment={selectSegment}
        />
    );

    const summary = schedule.summary ? (
        <SummaryCard summary={schedule.summary} theme={theme} compact={isShortHeight} />
    ) : null;

    let body;

    if (status === STATUS.LOADING) {
        body = (
            <View style={styles.centered} accessibilityLiveRegion="polite">
                <LoadingIndicator accessibilityLabel={Lang.t('fullScheduleLoading')} />
                <Text variant="bodyMedium" style={{ color: theme.textMuted }}>{Lang.t('fullScheduleLoading')}</Text>
            </View>
        );
    } else if (status === STATUS.ERROR) {
        body = (
            <EmptyState
                title={Lang.t('fullScheduleErrorTitle')}
                message={Lang.t('fullScheduleErrorMessage')}
                action={<Button mode="contained-tonal" icon="refresh" onPress={schedule.reload}>{Lang.t('fullScheduleRetry')}</Button>}
            />
        );
    } else if (sections.length === 0) {
        body = <EmptyState title={Lang.t('fullScheduleEmptyTitle')} message={Lang.t('fullScheduleEmptyMessage')} />;
    } else {
        body = (
            <SectionList
                ref={listRef}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                sections={sections}
                keyExtractor={item => item.key}
                renderItem={renderItem}
                renderSectionHeader={({ section }) => <HourHeader title={section.title} height={metrics.headerHeight} theme={theme} />}
                stickySectionHeadersEnabled
                getItemLayout={getItemLayout}
                initialNumToRender={24}
                windowSize={11}
                extraData={schedule.now}
                ListHeaderComponent={hasListHeader ? (
                    <View onLayout={event => setListHeaderHeight(Math.round(event.nativeEvent.layout.height))}>{summary}</View>
                ) : null}
                onScrollToIndexFailed={info => {
                    listRef.current?.getScrollResponder?.()?.scrollTo?.({ y: info.averageItemLength * info.index, animated: false });
                }}
            />
        );
    }

    const showFab = status === STATUS.READY && sections.length > 0;

    return (
        <AppScreen scroll={false} contentWidth={isTwoColumn ? 'wide' : 'normal'} contentStyle={styles.bounded}>
            {isTwoColumn ? (
                <View style={[ styles.twoColumn, { gap: responsive.tabletPaneGap || 16 } ]}>
                    <View style={[ styles.sidePane, { width: responsive.tabletMasterWidth || 360 } ]}>
                        {controls}
                        {summary}
                    </View>
                    <View style={styles.mainPane}>{body}</View>
                </View>
            ) : (
                <View style={styles.bounded}>
                    {controls}
                    <View style={styles.mainPane}>{body}</View>
                </View>
            )}
            {showFab ? (
                <FAB
                    icon={isToday ? 'clock-fast' : 'calendar-today'}
                    label={isToday ? Lang.t('fullScheduleGoToNow') : Lang.t('fullScheduleGoToToday')}
                    onPress={goToNow}
                    size={isShortHeight ? 'small' : 'medium'}
                    variant="secondary"
                    style={[ styles.fab, { borderRadius: theme.shape.lg } ]}
                    accessibilityLabel={isToday ? Lang.t('fullScheduleGoToNow') : Lang.t('fullScheduleGoToToday')}
                />
            ) : null}
        </AppScreen>
    );
}

function ScheduleControls({ schedule, params, theme, compact, onSelectSegment }) {
    const notice = holidayNotice(schedule.today);
    const holidaySegment = schedule.segments.find(segment => segment.kind === 'holiday');
    const canJumpToHoliday = Boolean(notice && holidaySegment && schedule.selectedSegmentId !== holidaySegment.id);
    const holidaySelected  = Boolean(holidaySegment && schedule.selectedSegmentId === holidaySegment.id);
    // Below ~150dp per segment "Dom. y feriados" gets ellipsized ("Dom. …"): switch to the compact
    // label and spell out what the selected timetable covers right under the selector.
    const [ controlsWidth, setControlsWidth ] = useState(0);
    const segmentWidth   = controlsWidth / Math.max(1, schedule.segments.length);
    const narrowSegments = controlsWidth > 0 && segmentWidth < 150;
    const tinySegments   = controlsWidth > 0 && segmentWidth < 100;   // ~320dp phones: "Háb." / "Sáb."
    const viewingOtherDay  = !schedule.isToday && schedule.dayOffset > 0
        ? Lang.t('fullScheduleViewingOtherDay', { date: formatDate(schedule.now.add(schedule.dayOffset, 'day')) })
        : null;

    return (
        <View style={[ styles.controls, compact ? styles.controlsCompact : null ]} onLayout={event => setControlsWidth(event.nativeEvent.layout.width)}>
            <View style={styles.routeRow}>
                <RouteHeader
                    origin={params.origin}
                    destination={params.destination}
                    compact={compact}
                    style={styles.routeHeader}
                />
                {schedule.source ? <FreshnessChip source={schedule.source} fetchedAt={schedule.fetchedAt} compact={compact} /> : null}
            </View>
            {schedule.segments.length > 1 ? (
                <SegmentedButtons
                    value={schedule.selectedSegmentId}
                    onValueChange={onSelectSegment}
                    density={compact ? 'small' : 'regular'}
                    buttons={schedule.segments.map(segment => ({
                        value:              segment.id,
                        label:              narrowSegments && segment.kind === 'holiday'
                            ? Lang.t('fullScheduleSegmentHolidayCompact')
                            : segmentLabel(segment, tinySegments),
                        accessibilityLabel: segment.name,
                        labelStyle:         theme.type.emphasized.label,
                        // Narrow: the longer holiday label takes a wider slot instead of being ellipsized.
                        style:              narrowSegments ? { flex: segment.kind === 'holiday' ? 1.35 : 1 } : undefined,
                        showSelectedCheck:  false
                    }))}
                />
            ) : null}
            {holidaySelected ? (
                <View style={styles.infoRow}>
                    <Icon source="calendar-star" size={18} color={theme.roles.primary} />
                    <Text variant="bodyMedium" style={[ styles.infoText, { color: theme.text } ]}>
                        {Lang.t('fullScheduleHolidayAppliesLabel')}
                    </Text>
                </View>
            ) : null}
            <View style={styles.infoRow}>
                <Icon source="calendar-blank-outline" size={18} color={theme.textMuted} />
                <Text variant="bodyMedium" numberOfLines={1} style={[ styles.infoText, { color: theme.textMuted } ]}>
                    {viewingOtherDay || todayLabel(schedule.today)}
                </Text>
            </View>
            {notice ? (
                <TouchableRipple
                    onPress={canJumpToHoliday ? () => onSelectSegment(holidaySegment.id) : undefined}
                    disabled={!canJumpToHoliday}
                    accessibilityRole={canJumpToHoliday ? 'button' : 'text'}
                    borderless
                    style={[ styles.notice, { backgroundColor: theme.warningSurface, borderRadius: theme.shape.lg } ]}
                >
                    <View style={styles.noticeInner}>
                        <Icon source="calendar-alert" size={20} color={theme.warning} />
                        <Text variant="bodyMedium" numberOfLines={compact ? 1 : 2} style={[ styles.infoText, { color: theme.text } ]}>{notice}</Text>
                        {canJumpToHoliday ? <Icon source="chevron-right" size={20} color={theme.warning} /> : null}
                    </View>
                </TouchableRipple>
            ) : null}
        </View>
    );
}

function SummaryCard({ summary, theme, compact }) {
    const tripText = trip => (trip.arrival ? `${formatTime(trip.departure)} → ${formatTime(trip.arrival)}` : formatTime(trip.departure));
    const footer   = [
        trainCountLabel(summary.count),
        summary.typicalMinutes !== null ? `~${minutesLabel(summary.typicalMinutes)}` : null
    ].filter(Boolean).join(' · ');

    if (compact) {
        return (
            <Text variant="bodyMedium" style={[ styles.summaryCompact, { color: theme.textMuted } ]} numberOfLines={1}>
                {`${Lang.t('fullScheduleFirstTrain')} ${tripText(summary.first)} · ${Lang.t('fullScheduleLastTrain')} ${tripText(summary.last)} · ${footer}`}
            </Text>
        );
    }

    const item = (icon, label, trip) => (
        <View style={styles.summaryItem} accessible accessibilityLabel={`${label}: ${tripText(trip)}`}>
            <View style={[ styles.summaryIcon, { backgroundColor: theme.roles.surfaceContainerHigh, borderRadius: theme.shape.full } ]}>
                <Icon source={icon} size={22} color={theme.accent} />
            </View>
            <View style={styles.summaryText}>
                <Text variant="labelLarge" style={{ color: theme.textMuted }}>{label}</Text>
                <Text variant="titleLarge" numberOfLines={1} style={[ styles.tabular, theme.type.emphasized.title, { color: theme.text } ]}>
                    {formatTime(trip.departure)}
                </Text>
                {trip.arrival ? (
                    <Text variant="bodySmall" style={[ styles.tabular, { color: theme.textMuted } ]}>{`→ ${formatTime(trip.arrival)}`}</Text>
                ) : null}
            </View>
        </View>
    );

    return (
        <TransitCard style={styles.summaryCard}>
            <View style={styles.summaryRow}>
                {item('weather-sunny', Lang.t('fullScheduleFirstTrain'), summary.first)}
                <View style={[ styles.summaryDivider, { backgroundColor: theme.roles.outlineVariant } ]} />
                {item('weather-night', Lang.t('fullScheduleLastTrain'), summary.last)}
            </View>
            <Text variant="bodySmall" style={{ color: theme.textMuted }}>{footer}</Text>
        </TransitCard>
    );
}

const styles = StyleSheet.create({
    bounded: {
        flex: 1,
        minHeight: 0
    },
    twoColumn: {
        flex: 1,
        minHeight: 0,
        flexDirection: 'row',
        alignItems: 'stretch'
    },
    sidePane: {
        flexShrink: 0,
        gap: 12
    },
    mainPane: {
        flex: 1,
        minHeight: 0
    },
    list: {
        flex: 1,
        minHeight: 0
    },
    listContent: {
        paddingBottom: 96
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24
    },
    controls: {
        gap: 10,
        marginBottom: 8
    },
    controlsCompact: {
        gap: 6,
        marginBottom: 4
    },
    routeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    routeHeader: {
        flex: 1
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    infoText: {
        flex: 1
    },
    notice: {
        paddingHorizontal: 14,
        paddingVertical: 10
    },
    noticeInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    summaryCard: {
        marginBottom: 8
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
    },
    summaryItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    summaryIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center'
    },
    summaryText: {
        flex: 1
    },
    summaryDivider: {
        width: StyleSheet.hairlineWidth,
        alignSelf: 'stretch'
    },
    summaryCompact: {
        paddingVertical: 4
    },
    tabular: {
        fontVariant: [ 'tabular-nums' ]
    },
    fab: {
        position: 'absolute',
        right: 16,
        bottom: 16
    }
});

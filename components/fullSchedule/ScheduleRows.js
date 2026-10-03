import React, { memo } from 'react';

import { StyleSheet, View } from 'react-native';

import { Icon, Text, TouchableRipple } from 'react-native-paper';

import Lang from '../../includes/Lang';

import { durationMinutes, formatTime } from './model';
import { minutesLabel, tripA11yLabel, waitLabel } from './labels';

const clampScale = fontScale => Math.min(Math.max(fontScale || 1, 1), 1.4);

// Fixed heights so SectionList#getItemLayout and scrollToLocation stay exact.
export const getRowMetrics = (fontScale, compact = false) => {
    const scale = clampScale(fontScale);

    return {
        headerHeight: Math.round((compact ? 36 : 44) * scale),
        rowHeight:    Math.round((compact ? 44 : 52) * scale),
        nowHeight:    Math.round(28 * scale)
    };
};

export const HourHeader = memo(function HourHeader({ title, height, theme }) {
    return (
        <View style={[ styles.headerFrame, { height, backgroundColor: theme.background } ]} accessibilityRole="header">
            <View style={[ styles.headerPill, { backgroundColor: theme.roles.surfaceContainerHigh, borderRadius: theme.shape.lg } ]}>
                <Text variant="titleMedium" style={[ theme.type.emphasized.title, { color: theme.text } ]}>{title}</Text>
            </View>
        </View>
    );
});

export const NowDivider = memo(function NowDivider({ now, height, theme, label }) {
    return (
        <View
            style={[ styles.nowRow, { height } ]}
            accessible
            accessibilityLabel={`${Lang.t('fullScheduleNow')} ${formatTime(now)}${label ? `, ${label}` : ''}`}
        >
            <View style={[ styles.nowDot, { backgroundColor: theme.accent } ]} />
            <Text variant="labelLarge" style={[ theme.type.emphasized.label, { color: theme.accent } ]}>{Lang.t('fullScheduleNow')}</Text>
            <View style={[ styles.nowLine, { backgroundColor: theme.accent } ]} />
            <Text variant="labelMedium" style={[ styles.tabular, { color: theme.accent } ]}>
                {label ? `${label} · ${formatTime(now)}` : formatTime(now)}
            </Text>
        </View>
    );
});

export const TripRow = memo(function TripRow({ item, now, height, theme, onPress, showWait }) {
    const { trip, isPast, isNext } = item;
    const minutes  = durationMinutes(trip);
    const trailing = isPast
        ? Lang.t('fullSchedulePast')
        : (showWait ? waitLabel(trip, now) : (minutes !== null ? minutesLabel(minutes) : ''));
    const textColor  = isNext ? theme.roles.onPrimaryContainer : theme.text;
    const mutedColor = isNext ? theme.roles.onPrimaryContainer : theme.textMuted;

    return (
        <TouchableRipple
            onPress={() => onPress(trip)}
            accessibilityRole="button"
            accessibilityLabel={tripA11yLabel(item)}
            accessibilityHint={Lang.t('fullScheduleRowHint')}
            borderless
            style={[
                styles.row,
                { height, borderRadius: theme.shape.lg },
                isNext ? { backgroundColor: theme.roles.primaryContainer } : null,
                isPast ? styles.past : null
            ]}
        >
            <View style={styles.rowInner}>
                <Icon source={isNext ? 'train' : 'clock-outline'} size={20} color={isNext ? theme.accent : mutedColor} />
                <Text variant="titleMedium" style={[ styles.tabular, styles.departure, theme.type.emphasized.title, { color: textColor } ]}>
                    {formatTime(trip.departure)}
                </Text>
                <Text variant="bodyMedium" numberOfLines={1} style={[ styles.tabular, styles.arrival, { color: mutedColor } ]}>
                    {trip.arrival ? `→ ${formatTime(trip.arrival)}${showWait && minutes !== null ? ` · ${minutesLabel(minutes)}` : ''}` : ''}
                </Text>
                {isNext ? (
                    <View style={[ styles.nextBadge, { backgroundColor: theme.background, borderRadius: theme.shape.full } ]}>
                        <Text variant="labelMedium" numberOfLines={1} style={[ theme.type.emphasized.label, { color: theme.accent } ]}>
                            {`${Lang.t('fullScheduleNext')} · ${trailing}`}
                        </Text>
                    </View>
                ) : (
                    <Text variant="bodyMedium" numberOfLines={1} style={[ styles.tabular, styles.trailing, { color: mutedColor } ]}>{trailing}</Text>
                )}
            </View>
        </TouchableRipple>
    );
});

const styles = StyleSheet.create({
    headerFrame: {
        justifyContent: 'center',
        paddingVertical: 4
    },
    headerPill: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 16
    },
    nowRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 4
    },
    nowDot: {
        width: 8,
        height: 8,
        borderRadius: 4
    },
    nowLine: {
        flex: 1,
        height: 2,
        borderRadius: 1
    },
    row: {
        justifyContent: 'center',
        paddingHorizontal: 12
    },
    rowInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
    },
    past: {
        opacity: 0.5
    },
    tabular: {
        fontVariant: [ 'tabular-nums' ]
    },
    departure: {
        minWidth: 52
    },
    arrival: {
        flex: 1
    },
    trailing: {
        flexShrink: 0,
        textAlign: 'right'
    },
    nextBadge: {
        flexShrink: 0,
        paddingHorizontal: 10,
        paddingVertical: 4
    }
});

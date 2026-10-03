import React from 'react';

import { StyleSheet, View } from 'react-native';

import { Text } from 'react-native-paper';

import Lang from '../../includes/Lang';
import { useTheme } from '../../includes/Theme';

import FreshnessChip from '../FreshnessChip';
import { StatusPill } from '../ui';

// Accessible one-liner for the summary card.
export const describeSummary = ({ departureText, arrivalText, durationMinutes, stopsCount }) => Lang.t('tripSummaryA11y', {
    departure: departureText || Lang.t('tripMissingTime'),
    arrival:   arrivalText || Lang.t('tripMissingTime'),
    minutes:   Number.isFinite(durationMinutes) ? durationMinutes : Lang.t('tripMissingTime'),
    stops:     stopsCount
});

function Cell({ label, value, caption, divider, theme }) {
    return (
        <View style={[ styles.cell, divider && { borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: theme.roles.outlineVariant } ]}>
            {label ? <Text variant="labelLarge" style={{ color: theme.roles.onSecondaryContainer, opacity: 0.8 }}>{label}</Text> : null}
            <Text
                variant="headlineMedium"
                style={[ styles.value, theme.type.emphasized.headline, { color: theme.roles.onSecondaryContainer } ]}
                numberOfLines={1}
                adjustsFontSizeToFit
            >
                {value}
            </Text>
            {caption ? <Text variant="bodyMedium" style={{ color: theme.roles.onSecondaryContainer, opacity: 0.8 }}>{caption}</Text> : null}
        </View>
    );
}

/**
 * "Sale · Llega · N min · N paradas" card (phone / tablet / desktop).
 *
 * @param {object} props
 * @param {string} props.departureText
 * @param {string} [props.arrivalText]
 * @param {number} [props.durationMinutes]
 * @param {number} props.stopsCount
 * @param {string} props.source            SOURCE value for FreshnessChip.
 * @param {number} [props.fetchedAt]
 * @param {string} [props.liveDepartureText]  Live estimate when it differs from the schedule.
 * @param {string} [props.phaseLabel]       e.g. "En viaje" / "Mañana".
 * @param {boolean} [props.stacked]         2×2 grid instead of a single row (narrow columns).
 */
export default function TripSummary({ departureText, arrivalText, durationMinutes, stopsCount, source, fetchedAt, liveDepartureText, phaseLabel, stacked = false, style }) {
    const { theme } = useTheme();
    const missing   = Lang.t('tripMissingTime');

    return (
        <View
            style={[ styles.card, { backgroundColor: theme.roles.secondaryContainer, borderRadius: theme.shape.xl }, style ]}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={describeSummary({ departureText, arrivalText, durationMinutes, stopsCount })}
        >
            <View style={styles.chips}>
                <FreshnessChip source={source} fetchedAt={fetchedAt} />
                {phaseLabel ? <StatusPill label={phaseLabel} tone="accent" /> : null}
            </View>
            <View style={[ styles.cells, stacked && styles.cellsStacked ]}>
                <View style={[ styles.pair, stacked && styles.pairStacked ]}>
                    <Cell label={Lang.t('tripSummaryDeparts')} value={departureText || missing} theme={theme} />
                    <Cell label={Lang.t('tripSummaryArrives')} value={arrivalText || missing} divider theme={theme} />
                </View>
                <View style={[ styles.pair, stacked && styles.pairStacked ]}>
                    <Cell
                        value={Number.isFinite(durationMinutes) ? Lang.t('tripDurationValue', { minutes: durationMinutes }) : missing}
                        caption={Lang.t('tripDurationCaption')}
                        divider={!stacked}
                        theme={theme}
                    />
                    <Cell
                        value={String(stopsCount)}
                        caption={Lang.t(stopsCount === 1 ? 'tripStopsCaptionOne' : 'tripStopsCaption')}
                        divider
                        theme={theme}
                    />
                </View>
            </View>
            {liveDepartureText ? (
                <Text variant="bodyMedium" style={{ color: theme.roles.onSecondaryContainer }}>
                    {Lang.t('tripLiveDeparture', { time: liveDepartureText })}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: 16,
        gap:     12
    },
    chips: {
        flexDirection: 'row',
        flexWrap:      'wrap',
        alignItems:    'center',
        gap:           8
    },
    cells: {
        flexDirection: 'row'
    },
    cellsStacked: {
        flexDirection: 'column',
        gap:           12
    },
    pair: {
        flex:          2,
        flexDirection: 'row'
    },
    // Not `flex: 0`: on web that means flex-basis 0 %, which collapses the row inside the column.
    pairStacked: {
        flexGrow:   0,
        flexShrink: 0,
        flexBasis:  'auto'
    },
    cell: {
        flex:              1,
        minWidth:          0,
        paddingHorizontal: 10,
        justifyContent:    'flex-end'
    },
    value: {
        fontVariant: [ 'tabular-nums' ]
    }
});

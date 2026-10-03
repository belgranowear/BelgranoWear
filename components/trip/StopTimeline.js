import React from 'react';

import { StyleSheet, View } from 'react-native';

import { Text } from 'react-native-paper';

import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import Lang from '../../includes/Lang';
import { useTheme } from '../../includes/Theme';

const RAIL_WIDTH         = 28;
const RAIL_WIDTH_COMPACT = 22;

// Ferrovías red for fills (`roles.action` from the Expressive theme; `primary` turns salmon in dark mode).
const actionColor = theme => theme.roles.action || theme.roles.primary;

// Accessible description of one stop, e.g. "Florida, parada intermedia, pasa a las 02:36, ya pasó".
export const describeStop = entry => {
    const roleKey = {
        origin:       'tripRoleOrigin',
        destination:  'tripRoleDestination',
        intermediate: 'tripRoleIntermediate',
        upstream:     'tripRoleUpstream'
    }[entry.role] || 'tripRoleIntermediate';

    const timeKey = { origin: 'tripStopA11yDeparts', destination: 'tripStopA11yArrives' }[entry.role] || 'tripStopA11yPasses';

    const parts = [ entry.title, Lang.t(roleKey) ];

    if (entry.timeText) {
        parts.push(Lang.t(timeKey, { time: entry.timeText }));
    } else {
        parts.push(Lang.t(entry.state === 'loading' ? 'tripStopA11yLoading' : 'tripStopA11yNoTime'));
    }

    if (entry.isPast) { parts.push(Lang.t('tripStopA11yPassed')); }

    return parts.join(', ');
};

function TrainMarker({ label, compact, theme }) {
    const railWidth = compact ? RAIL_WIDTH_COMPACT : RAIL_WIDTH;

    return (
        <View
            style={styles.row}
            accessible
            accessibilityRole="text"
            accessibilityLabel={label}
        >
            <View style={[ styles.rail, { width: railWidth } ]}>
                <View style={[ styles.lineHalf, styles.lineTop, styles.dashed, { backgroundColor: theme.roles.outlineVariant } ]} />
                <MaterialCommunityIcons name="train" size={compact ? 14 : 18} color={theme.textMuted} />
                <View style={[ styles.lineHalf, styles.lineBottom, styles.dashed, { backgroundColor: theme.roles.outlineVariant } ]} />
            </View>
            <View
                style={[
                    styles.markerPill,
                    compact && styles.markerPillCompact,
                    { backgroundColor: theme.roles.surfaceContainerHigh, borderRadius: theme.shape.full }
                ]}
            >
                <Text
                    variant={compact ? 'labelSmall' : 'labelLarge'}
                    style={{ color: theme.textMuted }}
                    numberOfLines={compact ? 2 : 1}
                >
                    {label}
                </Text>
            </View>
        </View>
    );
}

function StopRow({ entry, isFirst, isLast, previousTravel, compact, theme }) {
    const isEndpoint = entry.role === 'origin' || entry.role === 'destination';
    const isUpstream = entry.role === 'upstream';
    const travelColor = actionColor(theme);
    const mutedColor  = theme.roles.outlineVariant;
    const railWidth   = compact ? RAIL_WIDTH_COMPACT : RAIL_WIDTH;
    const dotSize     = isEndpoint ? (compact ? 14 : 20) : (compact ? 10 : 14);
    const lineWidth   = isUpstream ? 2 : (compact ? 3 : 4);
    // The rail above a stop belongs to the previous hop, below it to the next one.
    const topColor    = previousTravel ? travelColor : mutedColor;
    const bottomColor = isUpstream ? mutedColor : travelColor;
    const dimmed      = isUpstream || entry.isPast;

    const timeLabel = entry.timeText
        || (entry.state === 'loading' ? '··' : Lang.t('tripMissingTime'));

    return (
        <View
            style={[ styles.row, { minHeight: compact ? 28 : 44 }, dimmed && styles.dimmed ]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={describeStop(entry)}
        >
            <View style={[ styles.rail, { width: railWidth } ]}>
                {!isFirst ? (
                    <View style={[ styles.lineHalf, styles.lineTop, { width: previousTravel ? lineWidth : 2, backgroundColor: topColor } ]} />
                ) : null}
                <View
                    style={[
                        styles.dot,
                        {
                            width:           dotSize,
                            height:          dotSize,
                            borderRadius:    dotSize / 2,
                            borderWidth:     isEndpoint ? 0 : (compact ? 2 : 3),
                            borderColor:     isUpstream ? theme.textMuted : travelColor,
                            backgroundColor: isEndpoint ? travelColor : theme.background
                        }
                    ]}
                />
                {!isLast ? (
                    <View style={[ styles.lineHalf, styles.lineBottom, { width: lineWidth, backgroundColor: bottomColor } ]} />
                ) : null}
            </View>
            <Text
                variant={compact ? 'bodySmall' : (isEndpoint ? 'titleMedium' : 'bodyLarge')}
                numberOfLines={compact ? 1 : 2}
                style={[
                    styles.title,
                    { color: isUpstream ? theme.textMuted : theme.text },
                    isEndpoint && theme.type.emphasized.title
                ]}
            >
                {entry.title}
            </Text>
            <Text
                variant={compact ? 'bodySmall' : (isEndpoint ? 'titleMedium' : 'bodyMedium')}
                style={[
                    styles.time,
                    { color: isEndpoint ? theme.text : theme.textMuted },
                    isEndpoint && theme.type.emphasized.title
                ]}
            >
                {timeLabel}
            </Text>
        </View>
    );
}

// "… N paradas" connector used by the watch summary; pressing it expands the list.
function CollapsedRow({ count, onPress, compact, theme }) {
    const railWidth = compact ? RAIL_WIDTH_COMPACT : RAIL_WIDTH;

    return (
        <View style={[ styles.row, { minHeight: compact ? 26 : 36 } ]}>
            <View style={[ styles.rail, { width: railWidth } ]}>
                <View style={[ styles.lineFull, { width: compact ? 3 : 4, backgroundColor: actionColor(theme), opacity: 0.55 } ]} />
            </View>
            <Text
                variant={compact ? 'bodySmall' : 'bodyMedium'}
                style={[ styles.title, { color: theme.textMuted } ]}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={Lang.t('tripHiddenStopsA11y', { hidden: count })}
                suppressHighlighting
            >
                {Lang.t(count === 1 ? 'tripHiddenStopsOne' : 'tripHiddenStops', { hidden: count })}
            </Text>
        </View>
    );
}

/**
 * Vertical stop diagram.
 *
 * @param {object}   props
 * @param {Array}    props.entries   Rows in travel order: `{ type:'stop', id, title, role, timeText, state, isPast }`,
 *                                   `{ type:'marker', label }` or `{ type:'collapsed', count, onPress }`.
 * @param {boolean}  [props.compact] Watch density.
 */
export default function StopTimeline({ entries, compact = false, style }) {
    const { theme } = useTheme();
    const stopEntries = entries.filter(entry => entry.type === 'stop');
    const firstStop   = stopEntries[0];
    const lastStop    = stopEntries[stopEntries.length - 1];
    let   previousTravel = false;

    return (
        <View style={style}>
            {entries.map((entry, index) => {
                if (entry.type === 'marker') {
                    return <TrainMarker key={`marker-${index}`} label={entry.label} compact={compact} theme={theme} />;
                }

                if (entry.type === 'collapsed') {
                    previousTravel = true;
                    return <CollapsedRow key={`collapsed-${index}`} count={entry.count} onPress={entry.onPress} compact={compact} theme={theme} />;
                }

                const row = (
                    <StopRow
                        key={`stop-${entry.id}`}
                        entry={entry}
                        isFirst={entry === firstStop}
                        isLast={entry === lastStop}
                        previousTravel={previousTravel}
                        compact={compact}
                        theme={theme}
                    />
                );

                previousTravel = entry.role !== 'upstream' && entry.role !== 'destination';

                return row;
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           12
    },
    dimmed: {
        opacity: 0.5
    },
    rail: {
        alignSelf:      'stretch',
        alignItems:     'center',
        justifyContent: 'center'
    },
    lineHalf: {
        position:     'absolute',
        borderRadius: 2
    },
    lineTop: {
        top:    0,
        bottom: '50%'
    },
    lineBottom: {
        top:    '50%',
        bottom: 0
    },
    lineFull: {
        position:     'absolute',
        top:          0,
        bottom:       0,
        borderRadius: 2
    },
    dashed: {
        width:   2,
        opacity: 0.8
    },
    dot: {
        zIndex: 1
    },
    title: {
        flex:     1,
        minWidth: 0
    },
    time: {
        fontVariant: [ 'tabular-nums' ],
        textAlign:   'right'
    },
    markerPill: {
        flexShrink:        1,
        paddingHorizontal: 12,
        paddingVertical:   6,
        marginVertical:    4
    },
    markerPillCompact: {
        paddingHorizontal: 8,
        paddingVertical:   3,
        marginVertical:    2
    }
});

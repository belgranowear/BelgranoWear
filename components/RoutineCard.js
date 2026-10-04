import React, { useEffect, useState } from 'react';

import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Button, Icon, Text } from 'react-native-paper';

import { isRoundScreen } from '../includes/Device';
import Lang from '../includes/Lang';
import Preferences from '../includes/Preferences';
import Reminders from '../includes/Reminders';
import { useTheme } from '../includes/Theme';

import { WatchScaleItem } from './ui';
import ReminderEditor, { DEFAULT_LEAD_MINUTES, DEFAULT_REMINDER_TIME, WORKING_WEEKDAYS, formatRoute } from './ReminderEditor';

// A usual time is only suggested once the trip was opened at least this often in the same 5-minute slot.
const MIN_SLOT_OPENS = 2;

const tripKey = trip => `${trip.origin.id}:${trip.destination.id}`;

const isValidTrip = trip => trip?.origin?.id != null && trip?.destination?.id != null;

// Picks the most frequently opened recent trip that has no weekly reminder yet and wasn't dismissed.
export const buildRoutineSuggestion = ({ recentTrips, usage, dismissed, weeklyReminders }) => {
    const covered    = new Set((weeklyReminders || []).map(tripKey));
    const candidates = (recentTrips || [])
        .filter(isValidTrip)
        .filter(trip => !covered.has(tripKey(trip)) && (dismissed || []).indexOf(tripKey(trip)) === -1)
        .map((trip, index) => ({ trip, index, stats: usage?.[tripKey(trip)] || null }));

    if (candidates.length === 0) { return null; }

    candidates.sort((left, right) => ((Number(right.stats?.count) || 0) - (Number(left.stats?.count) || 0)) || (left.index - right.index));

    const { trip, stats } = candidates[0];
    const slots           = stats?.slots && typeof(stats.slots) === 'object' ? Object.entries(stats.slots) : [];
    const [ topSlot ]     = slots.sort((left, right) => right[1] - left[1]);
    const time            = topSlot && topSlot[1] >= MIN_SLOT_OPENS && Preferences.isValidReminderTime(topSlot[0]) ? topSlot[0] : null;
    const weekend         = (Number(stats?.weekendCount) || 0) > (Number(stats?.weekdayCount) || 0);

    return {
        tripId:      tripKey(trip),
        origin:      { id: String(trip.origin.id),      title: trip.origin.title      },
        destination: { id: String(trip.destination.id), title: trip.destination.title },
        time,
        weekdays:    weekend ? [ 6, 7 ] : WORKING_WEEKDAYS,
        weekend
    };
};

const suggestionMessage = suggestion => {
    if (!suggestion.time) { return Lang.t('routineSuggestionGenericMessage'); }

    return Lang.t(suggestion.weekend ? 'routineSuggestionWeekendMessage' : 'routineSuggestionWeekdaysMessage').replace('%s', suggestion.time);
};

/**
 * F5 suggested routine on the destination picker ("¿Te aviso de lunes a viernes a las 07:40?"),
 * derived from recent trips, strictly opt-in: nothing is scheduled until the user saves the editor,
 * and "Ahora no" hides the suggestion for that trip for good.
 *
 * @param {object}   props
 * @param {Array}    props.recentTrips   Preferences recent trips `[{ id, origin, destination, updatedAt }]`.
 * @param {Function} [props.onOpenTrip]  ({ origin, destination }) => void.
 * @param {Function} [props.onOpenReminders]  Navigates to the Reminders screen.
 * @param {boolean}  [props.compact]
 * @param {object}   [props.style]
 */
export default function RoutineCard({ recentTrips, onOpenTrip, onOpenReminders, compact = false, style }) {
    const { theme } = useTheme();
    const { width, height } = useWindowDimensions();

    // On watches the card is a list item: as wide as the Desde chip on round faces, and scaled
    // by its distance from the centre like its neighbours so it never sits flat against the bezel.
    const compactWidth = compact && isRoundScreen({ width, height, watch: true }) ? '80%' : '92%';

    const [ suggestion,  setSuggestion  ] = useState(null);
    const [ editorValue, setEditorValue ] = useState(null);
    const [ status,      setStatus      ] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const loadSuggestion = async function loadRoutineSuggestion() {
            if (!Array.isArray(recentTrips) || recentTrips.length === 0) {
                setSuggestion(null);
                return;
            }

            try {
                const [ usage, dismissed, weeklyReminders ] = await Promise.all([
                    Preferences.getTripUsage(),
                    Preferences.getDismissedRoutineSuggestions(),
                    Preferences.getWeeklyReminders()
                ]);

                if (!cancelled) { setSuggestion(buildRoutineSuggestion({ recentTrips, usage, dismissed, weeklyReminders })); }
            } catch (exception) {
                console.warn('RoutineCard: couldn\'t build the suggestion:', exception);
            }
        };

        loadSuggestion();

        return () => { cancelled = true; };
    }, [ recentTrips ]);

    const dismiss = async function dismissRoutineSuggestion() {
        const tripId = suggestion?.tripId;

        setSuggestion(null);
        setStatus(null);

        if (tripId) { await Preferences.dismissRoutineSuggestion(tripId); }
    };

    const openEditor = () => setEditorValue({
        origin:      suggestion.origin,
        destination: suggestion.destination,
        weekdays:    suggestion.weekdays,
        time:        suggestion.time || DEFAULT_REMINDER_TIME,
        leadMinutes: DEFAULT_LEAD_MINUTES
    });

    const saveReminder = async function saveRoutineReminder(value) {
        const result = await Reminders.scheduleWeekly(value);

        if (result.reminder) {
            setEditorValue(null);
            setSuggestion(null);
        }

        setStatus({ text: result.message, saved: Boolean(result.reminder) });
    };

    const wrapCompact = card => (compact ? <WatchScaleItem maxScale={1}>{card}</WatchScaleItem> : card);

    const editor = (
        <ReminderEditor
            visible={Boolean(editorValue)}
            initialValue={editorValue}
            onSave={saveReminder}
            onDismiss={() => setEditorValue(null)}
        />
    );

    if (!suggestion) {
        if (!status?.saved) { return editor; }

        // Confirmation after saving, with a shortcut to the list; disappears on the next visit.
        return (
            <>
                {wrapCompact(
                    <View style={[ compact ? [ styles.compactCard, { width: compactWidth } ] : styles.card, { backgroundColor: theme.roles.surfaceContainerHigh, borderRadius: compact ? 24 : theme.shape.xl }, style ]}>
                        <Text variant={compact ? 'labelLarge' : 'titleSmall'} style={compact ? styles.centerText : null}>{status.text}</Text>
                        {onOpenReminders ? (
                            <Button mode="text" compact icon="bell-outline" onPress={onOpenReminders} style={compact ? null : styles.leftButton}>
                                {Lang.t('screenRemindersName')}
                            </Button>
                        ) : null}
                    </View>
                )}
                {editor}
            </>
        );
    }

    const route   = formatRoute(suggestion);
    const message = suggestionMessage(suggestion);

    if (compact) {
        return (
            <>
                {wrapCompact(
                    <View style={[ styles.compactCard, { width: compactWidth, backgroundColor: theme.roles.surfaceContainerHigh }, style ]}>
                        <View style={styles.labelRow}>
                            <Icon source="calendar-clock" size={14} color={theme.roles.primary} />
                            <Text style={[ styles.compactLabel, { color: theme.roles.primary } ]}>{Lang.t('routineSuggestionLabel')}</Text>
                        </View>
                        <Pressable
                            onPress={onOpenTrip ? () => onOpenTrip({ origin: suggestion.origin, destination: suggestion.destination }) : undefined}
                            disabled={!onOpenTrip}
                            accessibilityRole={onOpenTrip ? 'button' : undefined}
                            accessibilityHint={onOpenTrip ? Lang.t('routineOpenTripHint') : undefined}
                        >
                            <Text numberOfLines={2} style={[ styles.compactRoute, { color: theme.text } ]}>{route}</Text>
                        </Pressable>
                        <Text numberOfLines={3} style={[ styles.compactMessage, { color: theme.textMuted } ]}>{message}</Text>
                        <Button mode="contained" compact onPress={openEditor} style={styles.compactButton} labelStyle={styles.compactButtonLabel}>
                            {Lang.t('routineCreateBtnLabel')}
                        </Button>
                        <Button mode="text" compact onPress={dismiss} labelStyle={styles.compactButtonLabel}>
                            {Lang.t('routineDismissBtnLabel')}
                        </Button>
                    </View>
                )}
                {editor}
            </>
        );
    }

    return (
        <>
            <View style={[ styles.card, { backgroundColor: theme.roles.primaryContainer, borderRadius: theme.shape.xl }, style ]}>
                <View style={styles.labelRow}>
                    <Icon source="calendar-clock" size={18} color={theme.roles.primary} />
                    <Text variant="labelLarge" style={[ theme.type.emphasized.label, { color: theme.roles.primary } ]}>
                        {Lang.t('routineSuggestionLabel')}
                    </Text>
                </View>

                <Pressable
                    onPress={onOpenTrip ? () => onOpenTrip({ origin: suggestion.origin, destination: suggestion.destination }) : undefined}
                    disabled={!onOpenTrip}
                    accessibilityRole={onOpenTrip ? 'button' : undefined}
                    accessibilityHint={onOpenTrip ? Lang.t('routineOpenTripHint') : undefined}
                >
                    <Text variant="titleMedium" numberOfLines={2} style={[ theme.type.emphasized.title, { color: theme.roles.onPrimaryContainer } ]}>
                        {route}
                    </Text>
                </Pressable>

                <Text variant="bodyMedium" style={{ color: theme.roles.onPrimaryContainer }}>{message}</Text>

                {status && !status.saved ? (
                    <Text variant="bodySmall" style={{ color: theme.paperTheme.colors.error }}>{status.text}</Text>
                ) : null}

                <View style={styles.actions}>
                    <Button mode="text" onPress={dismiss}>{Lang.t('routineDismissBtnLabel')}</Button>
                    <Button mode="contained" icon="bell-plus-outline" onPress={openEditor}>{Lang.t('routineCreateBtnLabel')}</Button>
                </View>
            </View>
            {editor}
        </>
    );
}

const styles = StyleSheet.create({
    card: {
        paddingHorizontal: 16,
        paddingTop:     14,
        paddingBottom:  10,
        gap:            6
    },
    labelRow: {
        flexDirection:  'row',
        alignItems:     'center',
        gap:            8
    },
    actions: {
        flexDirection:  'row',
        justifyContent: 'flex-end',
        flexWrap:       'wrap',
        gap:            8,
        marginTop:      4
    },
    leftButton: {
        alignSelf:      'flex-start'
    },
    centerText: {
        textAlign:      'center'
    },
    compactCard: {
        alignSelf:      'center',
        alignItems:     'center',
        borderRadius:   24,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap:            4
    },
    compactLabel: {
        fontSize:       11,
        lineHeight:     14,
        fontWeight:     '800',
        textAlign:      'center'
    },
    compactRoute: {
        fontSize:       14,
        lineHeight:     17,
        fontWeight:     '900',
        textAlign:      'center'
    },
    compactMessage: {
        fontSize:       12,
        lineHeight:     15,
        textAlign:      'center'
    },
    compactButton: {
        alignSelf:      'stretch',
        borderRadius:   999,
        marginTop:      4
    },
    compactButtonLabel: {
        fontSize:       13,
        fontWeight:     '800'
    }
});

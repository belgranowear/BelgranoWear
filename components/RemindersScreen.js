import React, { useCallback, useEffect, useState } from 'react';

import { Pressable, StyleSheet, View } from 'react-native';

import {
    Button,
    Dialog,
    FAB,
    Icon,
    IconButton,
    Portal,
    Snackbar,
    Switch,
    Text
} from 'react-native-paper';

import Lang from '../includes/Lang';
import Reminders from '../includes/Reminders';
import { useTheme } from '../includes/Theme';
import { isAnyUIPreview, previewState } from '../includes/UIPreview';

import ReminderEditor, {
    DEFAULT_LEAD_MINUTES,
    DEFAULT_REMINDER_TIME,
    WEEKDAYS,
    WORKING_WEEKDAYS,
    formatRoute,
    formatWeekdays,
    weekdayLong,
    weekdayShort
} from './ReminderEditor';
import { AppScreen, EmptyState, useResponsiveMetrics } from './ui';

const CONTENT_MAX_WIDTH = 680;

// Sample list for the web UI preview (?uiPreview=reminders); never persisted.
const buildPreviewReminders = () => [
    {
        id:          'preview-1',
        origin:      previewState.favorites[0].origin,
        destination: previewState.favorites[0].destination,
        weekdays:    WORKING_WEEKDAYS,
        time:        '07:42',
        leadMinutes: 10,
        enabled:     true
    },
    {
        id:          'preview-2',
        origin:      previewState.favorites[0].destination,
        destination: previewState.favorites[0].origin,
        weekdays:    [ 1, 3, 5 ],
        time:        '18:15',
        leadMinutes: 5,
        enabled:     false
    }
];

const toEditorValue = reminder => ({
    id:          reminder.id,
    origin:      reminder.origin,
    destination: reminder.destination,
    weekdays:    reminder.weekdays,
    time:        reminder.time,
    leadMinutes: reminder.leadMinutes
});

function DayLetters({ weekdays, enabled }) {
    const { theme } = useTheme();

    return (
        <View style={styles.dayLetters} accessibilityLabel={weekdays.map(weekdayLong).join(', ')}>
            {WEEKDAYS.map(weekday => {
                const active = weekdays.indexOf(weekday) > -1;

                return (
                    <View
                        key={weekday}
                        style={[
                            styles.dayLetter,
                            {
                                backgroundColor: active && enabled ? theme.roles.secondaryContainer : 'transparent',
                                borderRadius:    theme.shape.full
                            }
                        ]}
                    >
                        <Text
                            style={[
                                styles.dayLetterText,
                                {
                                    color:   active ? (enabled ? theme.roles.onSecondaryContainer : theme.text) : theme.textMuted,
                                    opacity: active ? 1 : 0.5
                                }
                            ]}
                        >
                            {weekdayShort(weekday)}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

function ReminderRow({ reminder, onToggle, onEdit, onDelete, busy }) {
    const { theme } = useTheme();
    const route     = formatRoute(reminder);

    // The edit target and the switch/delete actions are siblings: on web a Pressable renders a
    // <button>, and buttons can't be nested.
    return (
        <View style={[ styles.row, { backgroundColor: theme.roles.surfaceContainerLow, borderRadius: theme.shape.lg } ]}>
            <Pressable
                onPress={() => onEdit(reminder)}
                accessibilityRole="button"
                accessibilityLabel={`${reminder.time}, ${route}, ${formatWeekdays(reminder.weekdays)}`}
                accessibilityHint={Lang.t('reminderEditHint')}
                style={({ pressed }) => [ styles.rowMain, { opacity: pressed ? 0.8 : 1 } ]}
            >
                <View style={[ styles.rowIcon, { backgroundColor: reminder.enabled ? theme.roles.primaryContainer : theme.roles.surfaceContainerHighest } ]}>
                    <Icon source="bell-ring-outline" size={22} color={reminder.enabled ? theme.roles.primary : theme.textMuted} />
                </View>
    
                <View style={styles.rowBody}>
                    <View style={styles.rowTitleLine}>
                        <Text variant="headlineSmall" style={[ styles.rowTime, theme.type.emphasized.headline, { color: reminder.enabled ? theme.text : theme.textMuted } ]}>
                            {reminder.time}
                        </Text>
                        <Text variant="labelMedium" style={{ color: theme.textMuted }}>
                            {reminder.enabled
                                ? Lang.t('reminderLeadSummary').replace('%s', reminder.leadMinutes)
                                : Lang.t('reminderOffLabel')}
                        </Text>
                    </View>
                    <Text variant="bodyMedium" numberOfLines={2} style={{ color: theme.text }}>{route}</Text>
                    <DayLetters weekdays={reminder.weekdays} enabled={reminder.enabled} />
                </View>
            </Pressable>

            <View style={styles.rowActions}>
                <Switch
                    value={reminder.enabled}
                    disabled={busy}
                    onValueChange={enabled => onToggle(reminder, enabled)}
                    accessibilityLabel={Lang.t('reminderEnableSwitchLabel').replace('%s', route)}
                />
                <IconButton
                    icon="delete-outline"
                    size={20}
                    onPress={() => onDelete(reminder)}
                    accessibilityLabel={Lang.t('reminderDeleteBtnLabel')}
                    style={styles.rowDelete}
                />
            </View>
        </View>
    );
}

function WatchReminderRow({ reminder, onToggle, onEdit, busy }) {
    const { theme } = useTheme();
    const route     = formatRoute(reminder);

    return (
        <Pressable
            onPress={() => onEdit(reminder)}
            accessibilityRole="button"
            accessibilityLabel={`${reminder.time}, ${route}, ${formatWeekdays(reminder.weekdays)}`}
            accessibilityHint={Lang.t('reminderEditHint')}
            style={({ pressed }) => [
                styles.watchRow,
                {
                    backgroundColor: theme.roles.surfaceContainerHigh,
                    opacity:         pressed ? 0.72 : 1
                }
            ]}
        >
            <View style={styles.watchRowText}>
                <Text style={[ styles.watchRowTime, { color: reminder.enabled ? theme.text : theme.textMuted } ]}>{reminder.time}</Text>
                <Text numberOfLines={1} style={[ styles.watchRowMeta, { color: theme.textMuted } ]}>
                    {formatWeekdays(reminder.weekdays)} · {reminder.leadMinutes}′
                </Text>
                <Text numberOfLines={1} style={[ styles.watchRowMeta, { color: theme.textMuted } ]}>
                    {reminder.destination.title}
                </Text>
            </View>
            <Switch
                value={reminder.enabled}
                disabled={busy}
                onValueChange={enabled => onToggle(reminder, enabled)}
                accessibilityLabel={Lang.t('reminderEnableSwitchLabel').replace('%s', route)}
            />
        </Pressable>
    );
}

/**
 * F5: list of weekly reminders with on/off switches, plus create/edit through ReminderEditor.
 *
 * Route params: none.
 */
export default function RemindersScreen({ navigation }) {
    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const preview    = isAnyUIPreview();

    const [ reminders,     setReminders     ] = useState([]);
    const [ loaded,        setLoaded        ] = useState(false);
    const [ editorValue,   setEditorValue   ] = useState(null);
    const [ pendingDelete, setPendingDelete ] = useState(null);
    const [ busyId,        setBusyId        ] = useState(null);
    const [ message,       setMessage       ] = useState(null);

    const loadReminders = useCallback(async function loadReminders() {
        if (preview) {
            setReminders(current => current.length ? current : buildPreviewReminders());
            setLoaded(true);
            return;
        }

        try {
            setReminders(await Reminders.listWeekly());
        } catch (exception) {
            console.warn('RemindersScreen: couldn\'t load reminders:', exception);
        } finally {
            setLoaded(true);
        }
    }, [ preview ]);

    useEffect(() => {
        const refresh = async function refreshReminders() {
            await loadReminders();

            if (!preview) {
                await Reminders.syncWeekly();
                await loadReminders();
            }
        };

        refresh();

        return navigation?.addListener ? navigation.addListener('focus', loadReminders) : undefined;
    }, [ navigation, loadReminders, preview ]);

    const showResult = result => {
        if (!result) { return; }

        setMessage({ text: result.message, action: result.action });
    };

    const openNewReminder = () => setEditorValue({
        weekdays:    WORKING_WEEKDAYS,
        time:        DEFAULT_REMINDER_TIME,
        leadMinutes: DEFAULT_LEAD_MINUTES
    });

    const saveReminder = async function saveReminder(value) {
        if (preview) {
            const id = value.id || `preview-${Date.now()}`;

            setReminders(current => [ ...current.filter(item => item.id !== id), { ...value, id, enabled: true } ]);
            setEditorValue(null);
            return;
        }

        const result = await Reminders.scheduleWeekly(value);

        if (result.reminder) { setEditorValue(null); }

        showResult(result);
        await loadReminders();
    };

    const toggleReminder = async function toggleReminder(reminder, enabled) {
        setReminders(current => current.map(item => item.id === reminder.id ? { ...item, enabled } : item));

        if (preview) { return; }

        setBusyId(reminder.id);

        try {
            const result = await Reminders.setWeeklyEnabled(reminder.id, enabled);

            if (!result.ok || result.action) { showResult(result); }
        } finally {
            setBusyId(null);
            await loadReminders();
        }
    };

    const confirmDelete = async function confirmDelete() {
        const reminder = pendingDelete;

        setPendingDelete(null);
        setEditorValue(null);

        if (!reminder) { return; }

        if (preview) {
            setReminders(current => current.filter(item => item.id !== reminder.id));
            return;
        }

        showResult(await Reminders.cancelWeekly(reminder.id));
        await loadReminders();
    };

    const editReminder = reminder => setEditorValue(toEditorValue(reminder));

    const editor = (
        <ReminderEditor
            visible={Boolean(editorValue)}
            initialValue={editorValue}
            onSave={saveReminder}
            onDismiss={() => setEditorValue(null)}
            onDelete={value => {
                setEditorValue(null);
                setPendingDelete(reminders.find(item => item.id === value.id) || value);
            }}
        />
    );

    const dialogs = (
        <Portal>
            <Dialog visible={Boolean(pendingDelete)} onDismiss={() => setPendingDelete(null)} style={styles.dialog}>
                <Dialog.Title>{Lang.t('reminderDeleteTitle')}</Dialog.Title>
                <Dialog.Content>
                    <Text variant="bodyMedium">
                        {Lang.t('reminderDeleteMessage').replace('%s', pendingDelete ? `${formatRoute(pendingDelete)} (${pendingDelete.time})` : '')}
                    </Text>
                </Dialog.Content>
                <Dialog.Actions>
                    <Button onPress={() => setPendingDelete(null)}>{Lang.t('reminderCancelBtnLabel')}</Button>
                    <Button onPress={confirmDelete} textColor={theme.paperTheme.colors.error}>{Lang.t('reminderDeleteBtnLabel')}</Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );

    const snackbar = (
        <Snackbar
            visible={Boolean(message)}
            onDismiss={() => setMessage(null)}
            duration={message?.action ? 7000 : 3500}
            action={message?.action ? {
                label:   Lang.t('reminderOpenSettingsBtnLabel'),
                onPress: () => Reminders.openSettings(message.action)
            } : undefined}
            style={responsive.isWatch ? styles.watchSnackbar : styles.snackbar}
        >
            {message?.text || ''}
        </Snackbar>
    );

    if (responsive.isWatch) {
        return (
            <View style={styles.fill}>
                <AppScreen contentStyle={styles.watchStack}>
                    <Text style={[ styles.watchTitle, { color: theme.text } ]}>{Lang.t('screenRemindersName')}</Text>

                    <Pressable
                        onPress={openNewReminder}
                        accessibilityRole="button"
                        accessibilityLabel={Lang.t('newReminderBtnLabel')}
                        style={({ pressed }) => [
                            styles.watchNewButton,
                            { backgroundColor: theme.roles.primary, opacity: pressed ? 0.8 : 1 }
                        ]}
                    >
                        <Icon source="plus" size={18} color={theme.roles.onPrimary} />
                        <Text style={[ styles.watchNewText, { color: theme.roles.onPrimary } ]}>{Lang.t('newReminderShortBtnLabel')}</Text>
                    </Pressable>

                    {loaded && reminders.length === 0 ? (
                        <Text style={[ styles.watchEmpty, { color: theme.textMuted } ]}>{Lang.t('weeklyRemindersEmptyTitle')}</Text>
                    ) : null}

                    {reminders.map(reminder => (
                        <WatchReminderRow
                            key={reminder.id}
                            reminder={reminder}
                            busy={busyId === reminder.id}
                            onToggle={toggleReminder}
                            onEdit={editReminder}
                        />
                    ))}

                    <View style={{ height: Math.round(responsive.shortestSide * 0.18) }} />
                </AppScreen>
                {editor}
                {dialogs}
                {snackbar}
            </View>
        );
    }

    return (
        <View style={styles.fill}>
            <AppScreen contentStyle={styles.screenContent}>
                <View style={styles.column}>
                    <Text variant="bodyMedium" style={[ styles.intro, { color: theme.textMuted } ]}>
                        {Lang.t('weeklyRemindersIntro')}
                    </Text>

                    {Reminders.isWeeklySupported() || preview ? null : (
                        <View style={[ styles.banner, { backgroundColor: theme.roles.surfaceContainerHigh, borderRadius: theme.shape.md } ]}>
                            <Icon source="bell-off-outline" size={20} color={theme.textMuted} />
                            <Text variant="bodySmall" style={[ styles.bannerText, { color: theme.textMuted } ]}>
                                {Lang.t('weeklyRemindersWebHint')}
                            </Text>
                        </View>
                    )}

                    {loaded && reminders.length === 0 ? (
                        <EmptyState
                            title={Lang.t('weeklyRemindersEmptyTitle')}
                            message={Lang.t('weeklyRemindersEmptyMessage')}
                            action={(
                                <Button mode="contained-tonal" icon="bell-plus-outline" onPress={openNewReminder}>
                                    {Lang.t('newReminderBtnLabel')}
                                </Button>
                            )}
                        />
                    ) : null}

                    <View style={styles.list}>
                        {reminders.map(reminder => (
                            <ReminderRow
                                key={reminder.id}
                                reminder={reminder}
                                busy={busyId === reminder.id}
                                onToggle={toggleReminder}
                                onEdit={editReminder}
                                onDelete={setPendingDelete}
                            />
                        ))}
                    </View>
                </View>
            </AppScreen>

            <FAB
                icon="plus"
                label={Lang.t('newReminderBtnLabel')}
                onPress={openNewReminder}
                style={[ styles.fab, { right: responsive.isTablet ? 32 : 16 } ]}
                accessibilityLabel={Lang.t('newReminderBtnLabel')}
            />

            {editor}
            {dialogs}
            {snackbar}
        </View>
    );
}

const styles = StyleSheet.create({
    fill: {
        flex:           1
    },
    screenContent: {
        paddingBottom:  96
    },
    column: {
        width:          '100%',
        maxWidth:       CONTENT_MAX_WIDTH,
        alignSelf:      'center',
        gap:            12
    },
    intro: {
        marginBottom:   4
    },
    banner: {
        flexDirection:  'row',
        alignItems:     'center',
        gap:            12,
        padding:        12
    },
    bannerText: {
        flex:           1
    },
    list: {
        gap:            8
    },
    row: {
        flexDirection:  'row',
        alignItems:     'center',
        gap:            12,
        paddingVertical: 12,
        paddingLeft:    16,
        paddingRight:   4,
        minHeight:      88
    },
    rowMain: {
        flex:          1,
        minWidth:      0,
        flexDirection: 'row',
        alignItems:    'center',
        gap:           12,
        alignSelf:     'stretch'
    },
    rowIcon: {
        width:          40,
        height:         40,
        borderRadius:   20,
        alignItems:     'center',
        justifyContent: 'center'
    },
    rowBody: {
        flex:           1,
        gap:            2
    },
    rowTitleLine: {
        flexDirection:  'row',
        alignItems:     'baseline',
        flexWrap:       'wrap',
        columnGap:      8
    },
    rowTime: {
        fontVariant:    [ 'tabular-nums' ]
    },
    rowActions: {
        alignItems:     'center'
    },
    rowDelete: {
        margin:         0
    },
    dayLetters: {
        flexDirection:  'row',
        gap:            2,
        marginTop:      4
    },
    dayLetter: {
        width:          24,
        height:         24,
        alignItems:     'center',
        justifyContent: 'center'
    },
    dayLetterText: {
        fontSize:       12,
        fontWeight:     '800',
        includeFontPadding: false
    },
    fab: {
        position:       'absolute',
        bottom:         24
    },
    dialog: {
        maxWidth:       420,
        width:          '90%',
        alignSelf:      'center'
    },
    snackbar: {
        maxWidth:       CONTENT_MAX_WIDTH,
        alignSelf:      'center'
    },
    watchSnackbar: {
        marginHorizontal: '12%',
        marginBottom:   '10%'
    },
    watchStack: {
        alignItems:     'center',
        gap:            8
    },
    watchTitle: {
        textAlign:      'center',
        fontWeight:     '900',
        fontSize:       18,
        lineHeight:     22,
        paddingTop:     4
    },
    watchNewButton: {
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            6,
        minHeight:      44,
        minWidth:       '58%',
        paddingHorizontal: 16,
        borderRadius:   22
    },
    watchNewText: {
        fontSize:       15,
        fontWeight:     '800'
    },
    watchEmpty: {
        width:          '76%',
        textAlign:      'center',
        fontSize:       13,
        lineHeight:     16
    },
    watchRow: {
        width:          '88%',
        minHeight:      56,
        borderRadius:   28,
        flexDirection:  'row',
        alignItems:     'center',
        paddingLeft:    18,
        paddingRight:   10,
        paddingVertical: 6,
        gap:            6
    },
    watchRowText: {
        flex:           1
    },
    watchRowTime: {
        fontSize:       20,
        lineHeight:     24,
        fontWeight:     '900',
        fontVariant:    [ 'tabular-nums' ]
    },
    watchRowMeta: {
        fontSize:       12,
        lineHeight:     15,
        fontWeight:     '600'
    }
});

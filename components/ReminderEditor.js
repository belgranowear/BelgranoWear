import React, { useEffect, useState } from 'react';

import {
    Modal as NativeModal,
    Pressable,
    ScrollView,
    StyleSheet,
    View
} from 'react-native';

import {
    Button,
    HelperText,
    IconButton,
    SegmentedButtons,
    Text,
    TextInput
} from 'react-native-paper';

import Cache from '../includes/Cache';
import Lang from '../includes/Lang';
import Preferences from '../includes/Preferences';
import { useTheme } from '../includes/Theme';
import { isAnyUIPreview, previewState } from '../includes/UIPreview';

import AnimatedSheet, { SheetDragArea } from './layout/AnimatedSheet';
import { clamp, useResponsiveMetrics } from './ui';

export const WEEKDAYS              = [ 1, 2, 3, 4, 5, 6, 7 ];
export const WORKING_WEEKDAYS      = [ 1, 2, 3, 4, 5 ];
export const LEAD_OPTIONS          = [ 5, 10, 15 ];
export const DEFAULT_LEAD_MINUTES  = 10;
export const DEFAULT_REMINDER_TIME = '07:30';

const MAX_ROUTE_OPTIONS = 8;
const MINUTES_PER_DAY   = 24 * 60;
const WATCH_STEPS       = [ 'route', 'days', 'time', 'lead' ];

export const weekdayShort = weekday => Lang.t(`reminderWeekdayShort${weekday}`);
export const weekdayLong  = weekday => Lang.t(`reminderWeekdayLong${weekday}`);

const sortedDays = weekdays => [ ...new Set((weekdays || []).map(Number)) ].filter(day => day >= 1 && day <= 7).sort((left, right) => left - right);

const sameDays = (left, right) => left.length === right.length && left.every((day, index) => day === right[index]);

// "Todos los días", "L – V", "Sáb. y dom." or the individual initials ("L X V").
export const formatWeekdays = weekdays => {
    const days = sortedDays(weekdays);

    if (days.length === 7) { return Lang.t('reminderDaysEveryDay'); }
    if (sameDays(days, WORKING_WEEKDAYS)) { return Lang.t('reminderDaysWeekdays'); }
    if (sameDays(days, [ 6, 7 ])) { return Lang.t('reminderDaysWeekend'); }

    return days.map(weekdayShort).join(' ');
};

export const formatRoute = trip => (trip?.origin && trip?.destination)
    ? `${trip.origin.title} → ${trip.destination.title}`
    : '';

const routeKey = trip => `${trip.origin.id}:${trip.destination.id}`;

const parseTime = time => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));

    return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
};

const pad2 = value => String(value).padStart(2, '0');

const shiftTime = (time, deltaMinutes) => {
    const clock        = parseTime(time) || parseTime(DEFAULT_REMINDER_TIME);
    const totalMinutes = ((((clock.hour * 60) + clock.minute + deltaMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

    return `${pad2(Math.floor(totalMinutes / 60))}:${pad2(totalMinutes % 60)}`;
};

// Keeps only digits and inserts the colon, so "0742" becomes "07:42".
const maskTimeInput = text => {
    const digits = String(text || '').replace(/\D/g, '').slice(0, 4);

    return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
};

const buildInitialState = initialValue => ({
    id:          initialValue?.id,
    origin:      initialValue?.origin      || null,
    destination: initialValue?.destination || null,
    weekdays:    sortedDays(initialValue?.weekdays).length ? sortedDays(initialValue.weekdays) : WORKING_WEEKDAYS,
    time:        Preferences.isValidReminderTime(initialValue?.time) ? initialValue.time : DEFAULT_REMINDER_TIME,
    leadMinutes: LEAD_OPTIONS.indexOf(Number(initialValue?.leadMinutes)) > -1 ? Number(initialValue.leadMinutes) : DEFAULT_LEAD_MINUTES
});

const isValidRoute = value => Boolean(value.origin && value.destination && String(value.origin.id) !== String(value.destination.id));

// Favorites first, then recents (deduplicated), plus the full station list from the cached
// availability options that DestinationPicker downloads (read-only, may be missing offline).
async function loadRouteOptions(currentRoute) {
    let favorites = [];
    let recents   = [];
    let stations  = [];

    if (isAnyUIPreview()) {
        favorites = previewState.favorites;
        recents   = previewState.recents;
        stations  = previewState.stations;
    } else {
        [ favorites, recents ] = await Promise.all([
            Preferences.getFavoriteTrips().catch(() => []),
            Preferences.getRecentTrips().catch(() => [])
        ]);

        try {
            const options = await Cache.get(`${process.env.REMOTE_BASE_URL}/availability_options.json`);

            if (options?.destination && typeof(options.destination) === 'object') {
                stations = Object.keys(options.destination).map(id => ({ id, title: options.destination[id] }));
            }
        } catch (exception) {
            console.warn('ReminderEditor: couldn\'t read cached stations:', exception);
        }
    }

    const seen   = new Set();
    const routes = [ currentRoute, ...favorites, ...recents ]
        .filter(trip => trip && isValidRoute(trip))
        .filter(trip => {
            const key = routeKey(trip);

            if (seen.has(key)) { return false; }

            seen.add(key);

            return true;
        })
        .map(trip => ({
            origin:      { id: String(trip.origin.id),      title: trip.origin.title      },
            destination: { id: String(trip.destination.id), title: trip.destination.title }
        }))
        .slice(0, MAX_ROUTE_OPTIONS);

    return { routes, stations };
}

function useEditorState(visible, initialValue) {
    const [ value,        setValue        ] = useState(() => buildInitialState(initialValue));
    const [ timeText,     setTimeText     ] = useState(value.time);
    const [ routes,       setRoutes       ] = useState([]);
    const [ stations,     setStations     ] = useState([]);
    const [ saving,       setSaving       ] = useState(false);
    const [ pickerPhase,  setPickerPhase  ] = useState(null);
    const [ pickerOrigin, setPickerOrigin ] = useState(null);

    useEffect(() => {
        if (!visible) { return; }

        const nextValue = buildInitialState(initialValue);
        let cancelled   = false;

        setValue(nextValue);
        setTimeText(nextValue.time);
        setSaving(false);
        setPickerPhase(null);
        setPickerOrigin(null);

        loadRouteOptions(isValidRoute(nextValue) ? nextValue : null).then(options => {
            if (cancelled) { return; }

            setRoutes(options.routes);
            setStations(options.stations);

            // Preselect the first known route so the most common case is one tap.
            if (!isValidRoute(nextValue) && options.routes.length > 0) {
                setValue(current => isValidRoute(current) ? current : { ...current, ...options.routes[0] });
            }
        });

        return () => { cancelled = true; };
    }, [ visible ]);

    const setTime = time => {
        setValue(current => ({ ...current, time }));
        setTimeText(time);
    };

    const onTimeTextChange = text => {
        const masked = maskTimeInput(text);

        setTimeText(masked);

        if (Preferences.isValidReminderTime(masked)) { setValue(current => ({ ...current, time: masked })); }
    };

    const toggleWeekday = weekday => setValue(current => {
        const days = current.weekdays.indexOf(weekday) > -1
            ? current.weekdays.filter(day => day !== weekday)
            : sortedDays([ ...current.weekdays, weekday ]);

        return { ...current, weekdays: days };
    });

    const selectLead = lead => setValue(current => ({ ...current, leadMinutes: Number(lead) }));

    const setWeekdays = weekdays => setValue(current => ({ ...current, weekdays: sortedDays(weekdays) }));

    const selectRoute = route => {
        setValue(current => ({ ...current, origin: route.origin, destination: route.destination }));
        setPickerPhase(null);
        setPickerOrigin(null);
    };

    const startStationPicker = () => {
        setPickerOrigin(null);
        setPickerPhase('origin');
    };

    const pickStation = station => {
        if (pickerPhase !== 'destination') {
            setPickerOrigin(station);
            setPickerPhase('destination');
            return;
        }

        const route = { origin: pickerOrigin, destination: station };

        setRoutes(current => [ route, ...current.filter(item => routeKey(item) !== routeKey(route)) ].slice(0, MAX_ROUTE_OPTIONS));
        selectRoute(route);
    };

    const timeValid  = Preferences.isValidReminderTime(timeText);
    const routeValid = isValidRoute(value);
    const daysValid  = value.weekdays.length > 0;

    return {
        value,
        timeText,
        routes,
        stations,
        saving,
        setSaving,
        pickerPhase,
        pickerOrigin,
        setPickerPhase,
        setTime,
        onTimeTextChange,
        toggleWeekday,
        setWeekdays,
        selectLead,
        selectRoute,
        startStationPicker,
        pickStation,
        timeValid,
        routeValid,
        daysValid,
        valid: timeValid && routeValid && daysValid
    };
}

function WeekdayToggle({ weekday, selected, onPress, size }) {
    const { theme } = useTheme();

    return (
        <Pressable
            onPress={() => onPress(weekday)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={weekdayLong(weekday)}
            hitSlop={4}
            style={({ pressed }) => [
                styles.weekday,
                {
                    width:           size,
                    height:          size,
                    borderRadius:    selected ? theme.shape.md : size / 2,
                    backgroundColor: selected ? theme.roles.primary : theme.roles.surfaceContainerHighest,
                    opacity:         pressed ? 0.72 : 1
                }
            ]}
        >
            <Text style={[ styles.weekdayText, { color: selected ? theme.roles.onPrimary : theme.textMuted } ]}>
                {weekdayShort(weekday)}
            </Text>
        </Pressable>
    );
}

function StationChoices({ editor, compact }) {
    const { theme } = useTheme();
    const stations  = editor.pickerPhase === 'destination'
        ? editor.stations.filter(station => station.id !== editor.pickerOrigin?.id)
        : editor.stations;

    return (
        <View style={styles.stationChoices}>
            <Text variant="labelLarge" style={[ compact ? styles.centerText : null, { color: theme.textMuted } ]}>
                {Lang.t(editor.pickerPhase === 'destination' ? 'reminderPickDestinationLabel' : 'reminderPickOriginLabel')}
            </Text>
            <View style={compact ? styles.choiceColumn : styles.choiceWrap}>
                {stations.map(station => (
                    <ChoicePill
                        key={station.id}
                        label={station.title}
                        onPress={() => editor.pickStation(station)}
                        compact={compact}
                    />
                ))}
            </View>
        </View>
    );
}

function ChoicePill({ label, selected, onPress, compact, icon, accessibilityRole = 'button' }) {
    const { theme } = useTheme();

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole={accessibilityRole}
            accessibilityState={accessibilityRole === 'radio' ? { checked: Boolean(selected) } : undefined}
            accessibilityLabel={label}
            style={({ pressed }) => [
                compact ? styles.watchPill : styles.pill,
                {
                    backgroundColor: selected ? theme.roles.secondaryContainer : theme.roles.surfaceContainerHigh,
                    borderColor:     selected ? theme.roles.primary : 'transparent',
                    borderRadius:    theme.shape.full,
                    opacity:         pressed ? 0.72 : 1
                }
            ]}
        >
            {icon ? <IconButton icon={icon} size={16} style={styles.pillIcon} iconColor={selected ? theme.roles.primary : theme.textMuted} /> : null}
            <Text
                numberOfLines={2}
                style={[
                    compact ? styles.watchPillText : styles.pillText,
                    { color: selected ? theme.roles.onSecondaryContainer : theme.text }
                ]}
            >
                {label}
            </Text>
        </Pressable>
    );
}

function SheetEditor({ visible, initialValue, onSave, onDismiss, onDelete }) {
    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const editor     = useEditorState(visible, initialValue);
    const { value }  = editor;
    const centered   = responsive.isTablet;
    const daySize    = clamp((Math.min(responsive.width, 560) - 48 - (6 * 6)) / 7, 36, 48);

    const save = async () => {
        if (!editor.valid || editor.saving) { return; }

        editor.setSaving(true);

        try {
            await onSave?.({ ...value, time: editor.timeText });
        } finally {
            editor.setSaving(false);
        }
    };

    const selectedKey = editor.routeValid ? routeKey(value) : null;

    return (
        <AnimatedSheet
            visible={visible}
            onDismiss={onDismiss}
            centered={centered}
            style={[
                styles.sheet,
                {
                    backgroundColor: theme.roles.surfaceContainerLow,
                    borderTopLeftRadius:     theme.shape.xl,
                    borderTopRightRadius:    theme.shape.xl,
                    borderBottomLeftRadius:  centered ? theme.shape.xl : 0,
                    borderBottomRightRadius: centered ? theme.shape.xl : 0,
                    maxHeight:               responsive.height * (centered ? 0.86 : 0.92)
                }
            ]}
        >
            <SheetDragArea>
                {centered ? null : (
                    <View style={styles.handleArea}>
                        <View style={[ styles.handle, { backgroundColor: theme.roles.outline } ]} />
                    </View>
                )}

                <View style={styles.sheetHeader}>
                    <Text variant="titleLarge" style={[ styles.sheetTitle, theme.type.emphasized.title ]}>
                        {Lang.t(value.id ? 'editReminderTitle' : 'newReminderBtnLabel')}
                    </Text>
                    {value.id && onDelete ? (
                        <IconButton
                            icon="delete-outline"
                            onPress={() => onDelete(value)}
                            accessibilityLabel={Lang.t('reminderDeleteBtnLabel')}
                        />
                    ) : null}
                    <IconButton
                        icon="close"
                        mode="contained-tonal"
                        onPress={onDismiss}
                        accessibilityLabel={Lang.t('reminderCloseBtnLabel')}
                    />
                </View>
            </SheetDragArea>

            <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.section}>
                    <Text variant="labelLarge" style={styles.sectionLabel}>{Lang.t('reminderRouteLabel')}</Text>

                    <View style={[ styles.routeSummary, { backgroundColor: theme.roles.secondaryContainer, borderRadius: theme.shape.lg } ]}>
                        <Text variant="titleMedium" numberOfLines={2} style={[ styles.routeSummaryText, { color: theme.roles.onSecondaryContainer } ]}>
                            {editor.routeValid ? formatRoute(value) : Lang.t('reminderRouteRequiredMessage')}
                        </Text>
                    </View>

                    {editor.pickerPhase ? <StationChoices editor={editor} /> : (
                        <>
                            {editor.routes.length > 0 ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeChips}>
                                    {editor.routes.map(route => (
                                        <ChoicePill
                                            key={routeKey(route)}
                                            label={formatRoute(route)}
                                            selected={routeKey(route) === selectedKey}
                                            onPress={() => editor.selectRoute(route)}
                                            accessibilityRole="radio"
                                        />
                                    ))}
                                </ScrollView>
                            ) : null}

                            {editor.stations.length > 0 ? (
                                <Button mode="text" icon="map-marker-path" onPress={editor.startStationPicker} style={styles.leftButton}>
                                    {Lang.t('reminderPickOtherRouteBtnLabel')}
                                </Button>
                            ) : null}

                            {editor.routes.length === 0 && editor.stations.length === 0 ? (
                                <Text variant="bodyMedium" style={{ color: theme.textMuted }}>{Lang.t('reminderNoRoutesHint')}</Text>
                            ) : null}
                        </>
                    )}
                </View>

                <View style={styles.section}>
                    <Text variant="labelLarge" style={styles.sectionLabel}>{Lang.t('reminderTimeLabel')}</Text>
                    <View style={styles.timeRow}>
                        <IconButton
                            icon="minus"
                            mode="contained-tonal"
                            onPress={() => editor.setTime(shiftTime(value.time, -1))}
                            onLongPress={() => editor.setTime(shiftTime(value.time, -10))}
                            accessibilityLabel={Lang.t('reminderDecreaseMinuteLabel')}
                        />
                        <TextInput
                            mode="outlined"
                            value={editor.timeText}
                            onChangeText={editor.onTimeTextChange}
                            keyboardType="number-pad"
                            maxLength={5}
                            left={<TextInput.Icon icon="clock-outline" />}
                            error={!editor.timeValid}
                            accessibilityLabel={Lang.t('reminderTimeLabel')}
                            style={styles.timeInput}
                            contentStyle={styles.timeInputContent}
                        />
                        <IconButton
                            icon="plus"
                            mode="contained-tonal"
                            onPress={() => editor.setTime(shiftTime(value.time, 1))}
                            onLongPress={() => editor.setTime(shiftTime(value.time, 10))}
                            accessibilityLabel={Lang.t('reminderIncreaseMinuteLabel')}
                        />
                    </View>
                    <HelperText type={editor.timeValid ? 'info' : 'error'} visible>
                        {Lang.t(editor.timeValid ? 'reminderTimeHelper' : 'reminderTimeInvalidMessage')}
                    </HelperText>
                </View>

                <View style={styles.section}>
                    <Text variant="labelLarge" style={styles.sectionLabel}>{Lang.t('reminderLeadLabel')}</Text>
                    <SegmentedButtons
                        value={String(value.leadMinutes)}
                        onValueChange={editor.selectLead}
                        buttons={LEAD_OPTIONS.map(lead => ({
                            value: String(lead),
                            label: Lang.t('reminderLeadOption').replace('%s', lead),
                            icon:  'bell-outline'
                        }))}
                    />
                </View>

                <View style={styles.section}>
                    <Text variant="labelLarge" style={styles.sectionLabel}>{Lang.t('reminderDaysLabel')}</Text>
                    <View style={styles.weekdayRow}>
                        {WEEKDAYS.map(weekday => (
                            <WeekdayToggle
                                key={weekday}
                                weekday={weekday}
                                size={daySize}
                                selected={value.weekdays.indexOf(weekday) > -1}
                                onPress={editor.toggleWeekday}
                            />
                        ))}
                    </View>
                    {editor.daysValid ? null : (
                        <HelperText type="error" visible>{Lang.t('reminderDaysRequiredMessage')}</HelperText>
                    )}
                </View>
            </ScrollView>

            <Button
                mode="contained"
                onPress={save}
                disabled={!editor.valid || editor.saving}
                loading={editor.saving}
                contentStyle={styles.saveButtonContent}
                style={styles.saveButton}
            >
                {Lang.t('reminderSaveBtnLabel')}
            </Button>
        </AnimatedSheet>
    );
}

function WatchStepper({ label, value, onIncrease, onDecrease, onIncreaseLong, onDecreaseLong, increaseLabel, decreaseLabel, size }) {
    const { theme } = useTheme();

    return (
        <View style={styles.watchStepper}>
            <IconButton icon="chevron-up" size={size * 0.5} mode="contained-tonal" onPress={onIncrease} onLongPress={onIncreaseLong} accessibilityLabel={increaseLabel} style={styles.watchStepperButton} />
            <Text accessibilityLabel={label} style={[ styles.watchTimeDigit, { color: theme.text, fontSize: size, lineHeight: size * 1.15 } ]}>{value}</Text>
            <IconButton icon="chevron-down" size={size * 0.5} mode="contained-tonal" onPress={onDecrease} onLongPress={onDecreaseLong} accessibilityLabel={decreaseLabel} style={styles.watchStepperButton} />
        </View>
    );
}

// Linear flow for WearOS: ruta → días → hora → anticipación, one step per screen with big targets.
function WatchEditor({ visible, initialValue, onSave, onDismiss, onDelete }) {
    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const editor     = useEditorState(visible, initialValue);
    const { value }  = editor;
    const [ stepIndex, setStepIndex ] = useState(0);

    useEffect(() => { if (visible) { setStepIndex(0); } }, [ visible ]);

    const step        = WATCH_STEPS[stepIndex];
    const side        = responsive.shortestSide;
    const sideInset   = Math.round(side * 0.11);
    const topInset    = Math.round(side * 0.1);
    const bottomInset = Math.round(side * 0.16);
    const daySize     = clamp(Math.floor((side * 0.72) / 4) - 6, 32, 44);
    const digitSize   = clamp(side * 0.2, 34, 52);
    const clock       = parseTime(value.time) || parseTime(DEFAULT_REMINDER_TIME);
    const stepValid   = {
        route: editor.routeValid,
        days:  editor.daysValid,
        time:  editor.timeValid,
        lead:  true
    }[step];
    const isLast      = stepIndex === WATCH_STEPS.length - 1;

    const goBack = () => {
        if (step === 'route' && editor.pickerPhase) {
            editor.setPickerPhase(null);
            return;
        }

        if (stepIndex === 0) {
            onDismiss?.();
            return;
        }

        setStepIndex(stepIndex - 1);
    };

    const goNext = async () => {
        if (!stepValid || editor.saving) { return; }

        if (!isLast) {
            setStepIndex(stepIndex + 1);
            return;
        }

        editor.setSaving(true);

        try {
            await onSave?.({ ...value });
        } finally {
            editor.setSaving(false);
        }
    };

    const selectedKey  = editor.routeValid ? routeKey(value) : null;
    const showStations = step === 'route' && (editor.pickerPhase || (editor.routes.length === 0 && editor.stations.length > 0));

    return (
        <NativeModal visible={visible} onRequestClose={goBack} animationType="fade" transparent={false} statusBarTranslucent>
            <View style={[ styles.watchRoot, { backgroundColor: theme.background } ]}>
                <ScrollView
                    contentContainerStyle={[
                        styles.watchContent,
                        { paddingHorizontal: sideInset, paddingTop: topInset, paddingBottom: bottomInset, minHeight: responsive.height }
                    ]}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={[ styles.watchStepLabel, { color: theme.textMuted } ]}>
                        {Lang.t('reminderStepLabel').replace('%s', stepIndex + 1).replace('%s', WATCH_STEPS.length)}
                    </Text>
                    <Text style={[ styles.watchTitle, { color: theme.text } ]} numberOfLines={2}>
                        {Lang.t({
                            route: 'reminderStepRoute',
                            days:  'reminderStepDays',
                            time:  'reminderStepTime',
                            lead:  'reminderStepLead'
                        }[step])}
                    </Text>

                    {step === 'route' ? (
                        showStations ? <StationChoices editor={editor} compact /> : (
                            <View style={styles.choiceColumn}>
                                {editor.routes.map(route => (
                                    <ChoicePill
                                        key={routeKey(route)}
                                        label={formatRoute(route)}
                                        selected={routeKey(route) === selectedKey}
                                        onPress={() => editor.selectRoute(route)}
                                        accessibilityRole="radio"
                                        compact
                                    />
                                ))}
                                {editor.stations.length > 0 ? (
                                    <Button mode="text" compact onPress={editor.startStationPicker}>
                                        {Lang.t('reminderPickOtherRouteBtnLabel')}
                                    </Button>
                                ) : null}
                                {editor.routes.length === 0 && editor.stations.length === 0 ? (
                                    <Text style={[ styles.watchHint, { color: theme.textMuted } ]}>{Lang.t('reminderNoRoutesHint')}</Text>
                                ) : null}
                            </View>
                        )
                    ) : null}

                    {step === 'days' ? (
                        <View style={styles.watchDays}>
                            <View style={styles.watchDaysGrid}>
                                {WEEKDAYS.map(weekday => (
                                    <WeekdayToggle
                                        key={weekday}
                                        weekday={weekday}
                                        size={daySize}
                                        selected={value.weekdays.indexOf(weekday) > -1}
                                        onPress={editor.toggleWeekday}
                                    />
                                ))}
                            </View>
                            <ChoicePill
                                label={Lang.t('reminderDaysWeekdays')}
                                selected={sameDays(value.weekdays, WORKING_WEEKDAYS)}
                                onPress={() => editor.setWeekdays(WORKING_WEEKDAYS)}
                                compact
                            />
                        </View>
                    ) : null}

                    {step === 'time' ? (
                        <View style={styles.watchTimeRow}>
                            <WatchStepper
                                label={Lang.t('hours')}
                                value={pad2(clock.hour)}
                                size={digitSize}
                                onIncrease={() => editor.setTime(shiftTime(value.time, 60))}
                                onDecrease={() => editor.setTime(shiftTime(value.time, -60))}
                                increaseLabel={Lang.t('reminderIncreaseHourLabel')}
                                decreaseLabel={Lang.t('reminderDecreaseHourLabel')}
                            />
                            <Text style={[ styles.watchTimeDigit, { color: theme.text, fontSize: digitSize, lineHeight: digitSize * 1.15 } ]}>:</Text>
                            <WatchStepper
                                label={Lang.t('minutes')}
                                value={pad2(clock.minute)}
                                size={digitSize}
                                onIncrease={() => editor.setTime(shiftTime(value.time, 1))}
                                onDecrease={() => editor.setTime(shiftTime(value.time, -1))}
                                onIncreaseLong={() => editor.setTime(shiftTime(value.time, 10))}
                                onDecreaseLong={() => editor.setTime(shiftTime(value.time, -10))}
                                increaseLabel={Lang.t('reminderIncreaseMinuteLabel')}
                                decreaseLabel={Lang.t('reminderDecreaseMinuteLabel')}
                            />
                        </View>
                    ) : null}

                    {step === 'lead' ? (
                        <View style={styles.choiceColumn}>
                            {LEAD_OPTIONS.map(lead => (
                                <ChoicePill
                                    key={lead}
                                    icon="bell-outline"
                                    label={Lang.t('reminderLeadSummary').replace('%s', lead)}
                                    selected={value.leadMinutes === lead}
                                    onPress={() => editor.selectLead(lead)}
                                    accessibilityRole="radio"
                                    compact
                                />
                            ))}
                        </View>
                    ) : null}

                    <View style={styles.watchFooter}>
                        <IconButton
                            icon={stepIndex === 0 && !editor.pickerPhase ? 'close' : 'arrow-left'}
                            mode="contained-tonal"
                            size={22}
                            onPress={goBack}
                            accessibilityLabel={Lang.t(stepIndex === 0 && !editor.pickerPhase ? 'reminderCloseBtnLabel' : 'reminderBackBtnLabel')}
                        />
                        <Button
                            mode="contained"
                            onPress={goNext}
                            disabled={!stepValid || editor.saving || Boolean(showStations)}
                            loading={editor.saving}
                            compact
                            style={styles.watchNextButton}
                            labelStyle={styles.watchNextLabel}
                        >
                            {Lang.t(isLast ? 'reminderSaveBtnLabel' : 'reminderNextBtnLabel')}
                        </Button>
                    </View>

                    {stepIndex === 0 && value.id && onDelete && !editor.pickerPhase ? (
                        <Button mode="text" compact textColor={theme.paperTheme.colors.error} onPress={() => onDelete(value)}>
                            {Lang.t('reminderDeleteBtnLabel')}
                        </Button>
                    ) : null}
                </ScrollView>
            </View>
        </NativeModal>
    );
}

/**
 * F5 weekly reminder editor: route, days of week, departure time, lead time (5/10/15 min).
 * Bottom sheet on phone (centered dialog on tablet/desktop), linear 4-step flow on watch.
 *
 * @param {object}   props
 * @param {boolean}  props.visible
 * @param {object}   [props.initialValue]  `{ id?, origin, destination, weekdays:number[] (1=Mon…7=Sun), time:'HH:mm', leadMinutes }`.
 * @param {Function} props.onSave          (value) => Promise|void, receives the same shape as initialValue.
 * @param {Function} props.onDismiss
 * @param {Function} [props.onDelete]      (value) => void; shows a delete action when editing an existing reminder.
 */
export default function ReminderEditor(props) {
    const responsive = useResponsiveMetrics();

    // Always mounted: both editors animate their own enter and exit from `visible`.
    return responsive.isWatch ? <WatchEditor {...props} /> : <SheetEditor {...props} />;
}

const styles = StyleSheet.create({
    centerText: {
        textAlign:      'center'
    },
    sheet: {
        width:          '100%',
        maxWidth:       560,
        alignSelf:      'center',
        paddingTop:     8,
        paddingBottom:  16,
        overflow:       'hidden'
    },
    handleArea: {
        // Taller touch target around the 4dp handle; the header below is draggable too.
        alignSelf:      'stretch',
        alignItems:     'center',
        justifyContent: 'center',
        height:         24,
        marginTop:      -8
    },
    handle: {
        width:          32,
        height:         4,
        borderRadius:   2,
        alignSelf:      'center',
        opacity:        0.5,
        marginBottom:   4
    },
    sheetHeader: {
        flexDirection:  'row',
        alignItems:     'center',
        paddingLeft:    24,
        paddingRight:   12
    },
    sheetTitle: {
        flex:           1
    },
    sheetScroll: {
        flexGrow:       0
    },
    sheetContent: {
        paddingHorizontal: 24,
        paddingBottom:  8,
        gap:            16
    },
    section: {
        gap:            8
    },
    sectionLabel: {
        fontWeight:     '700'
    },
    routeSummary: {
        paddingHorizontal: 16,
        paddingVertical: 12
    },
    routeSummaryText: {
        fontWeight:     '700'
    },
    routeChips: {
        gap:            8,
        paddingVertical: 2
    },
    leftButton: {
        alignSelf:      'flex-start'
    },
    stationChoices: {
        gap:            8
    },
    choiceWrap: {
        flexDirection:  'row',
        flexWrap:       'wrap',
        gap:            8
    },
    choiceColumn: {
        width:          '100%',
        gap:            8,
        alignItems:     'stretch'
    },
    pill: {
        minHeight:      40,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderWidth:    1,
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'center'
    },
    pillText: {
        fontSize:       14,
        lineHeight:     18,
        fontWeight:     '600'
    },
    pillIcon: {
        margin:         0,
        width:          20,
        height:         20
    },
    watchPill: {
        minHeight:      48,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderWidth:    2,
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'center'
    },
    watchPillText: {
        flexShrink:     1,
        textAlign:      'center',
        fontSize:       14,
        lineHeight:     17,
        fontWeight:     '800',
        includeFontPadding: false
    },
    timeRow: {
        flexDirection:  'row',
        alignItems:     'center',
        gap:            4
    },
    timeInput: {
        flex:           1
    },
    timeInputContent: {
        fontSize:       22,
        fontWeight:     '700',
        textAlign:      'center',
        letterSpacing:  1
    },
    weekdayRow: {
        flexDirection:  'row',
        justifyContent: 'space-between',
        gap:            6
    },
    weekday: {
        alignItems:     'center',
        justifyContent: 'center'
    },
    weekdayText: {
        fontSize:       15,
        fontWeight:     '800',
        includeFontPadding: false
    },
    saveButton: {
        marginHorizontal: 24,
        marginTop:      8,
        borderRadius:   999
    },
    saveButtonContent: {
        minHeight:      52
    },
    watchRoot: {
        flex:           1
    },
    watchContent: {
        flexGrow:       1,
        alignItems:     'center',
        justifyContent: 'center',
        gap:            10
    },
    watchStepLabel: {
        fontSize:       12,
        lineHeight:     15,
        fontWeight:     '700',
        textAlign:      'center'
    },
    watchTitle: {
        fontSize:       18,
        lineHeight:     22,
        fontWeight:     '900',
        textAlign:      'center'
    },
    watchHint: {
        fontSize:       13,
        lineHeight:     16,
        textAlign:      'center'
    },
    watchDays: {
        width:          '100%',
        alignItems:     'center',
        gap:            10
    },
    watchDaysGrid: {
        flexDirection:  'row',
        flexWrap:       'wrap',
        justifyContent: 'center',
        gap:            6
    },
    watchTimeRow: {
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            4
    },
    watchStepper: {
        alignItems:     'center'
    },
    watchStepperButton: {
        margin:         0
    },
    watchTimeDigit: {
        fontWeight:     '800',
        fontVariant:    [ 'tabular-nums' ],
        textAlign:      'center',
        includeFontPadding: false
    },
    watchFooter: {
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            8,
        marginTop:      4
    },
    watchNextButton: {
        borderRadius:   999,
        minWidth:       96
    },
    watchNextLabel: {
        fontSize:       14,
        fontWeight:     '800'
    }
});

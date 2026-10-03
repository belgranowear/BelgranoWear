import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { AppState, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, TouchableRipple } from 'react-native-paper';

import { NavigationContext } from '@react-navigation/native';

import * as Location from 'expo-location';

import dayjs from 'dayjs';

import Lang from '../includes/Lang';
import { useTheme } from '../includes/Theme';
import {
    WALK_MAX_DISTANCE_METERS,
    WALK_STATUS,
    classifyWalk,
    distanceMeters,
    formatDistance,
    getCoordinates,
    minutesUntil,
    walkMinutesForDistance
} from '../includes/Walk';

const POSITION_REFRESH_MS        = 60 * 1000;
const CLOCK_TICK_MS              = 20 * 1000;
const CURRENT_POSITION_TIMEOUT_MS = 10 * 1000;
const LAST_KNOWN_MAX_AGE_MS      = 5 * 60 * 1000;
const LAST_KNOWN_ACCURACY_METERS = 250;

// Permission states tracked by useWalkPosition().
const PERMISSION = {
    CHECKING:    'checking',
    GRANTED:     'granted',
    ASK:         'ask',          // Not granted yet and the OS lets us ask: show "Activar ubicación".
    DENIED:      'denied',       // User said no (or blocked): show a hint, never re-prompt on our own.
    UNAVAILABLE: 'unavailable'   // Module/platform failure: render nothing.
};

const withTimeout = (promise, timeout) => new Promise((resolve, reject) => {
    const handle = setTimeout(() => reject(new Error(`Location timed out after ${timeout} ms.`)), timeout);

    promise.then(
        value => { clearTimeout(handle); resolve(value); },
        error => { clearTimeout(handle); reject(error); }
    );
});

const permissionFromResponse = response => {
    if (response?.status === 'granted' || response?.granted) { return PERMISSION.GRANTED; }

    if (response?.status === 'denied' && response?.canAskAgain === false) { return PERMISSION.DENIED; }

    return PERMISSION.ASK;
};

// Screen focus without requiring a navigator (the card is also rendered in previews).
function useIsScreenActive() {
    const navigation = useContext(NavigationContext);
    const [ focused,  setFocused  ] = useState(() => (navigation?.isFocused ? navigation.isFocused() : true));
    const [ appState, setAppState ] = useState(AppState.currentState);

    useEffect(() => {
        if (!navigation?.addListener) { return undefined; }

        const unsubscribeFocus = navigation.addListener('focus', () => setFocused(true));
        const unsubscribeBlur  = navigation.addListener('blur',  () => setFocused(false));

        return () => {
            unsubscribeFocus();
            unsubscribeBlur();
        };
    }, [ navigation ]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', setAppState);

        return () => subscription?.remove?.();
    }, []);

    return focused && appState !== 'background' && appState !== 'inactive';
}

/**
 * Foreground-only location for the walking estimate. Never prompts on its own: it reads the
 * current permission and exposes `requestPermission()` for the "Activar ubicación" button.
 * Uses the last known fix first, then a balanced-accuracy fix with a timeout, refreshed every
 * ~60 s while `active`. All errors (including web geolocation failures) are swallowed.
 */
function useWalkPosition(active) {
    const [ permission, setPermission ] = useState(PERMISSION.CHECKING);
    const [ coords,     setCoords     ] = useState(null);
    const mountedRef  = useRef(true);
    const inFlightRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;

        Location.getForegroundPermissionsAsync()
            .then(response => { if (mountedRef.current) { setPermission(permissionFromResponse(response)); } })
            .catch(() => { if (mountedRef.current) { setPermission(PERMISSION.UNAVAILABLE); } });

        return () => { mountedRef.current = false; };
    }, []);

    const refresh = useCallback(async ({ useLastKnown }) => {
        if (inFlightRef.current) { return; }

        inFlightRef.current = true;

        try {
            if (useLastKnown) {
                try {
                    const lastKnown = await withTimeout(Location.getLastKnownPositionAsync({
                        maxAge:           LAST_KNOWN_MAX_AGE_MS,
                        requiredAccuracy: LAST_KNOWN_ACCURACY_METERS
                    }), CURRENT_POSITION_TIMEOUT_MS);
                    const point = getCoordinates(lastKnown);

                    if (point && mountedRef.current) { setCoords(point); }
                } catch (exception) {
                    // Not supported on every platform (e.g. some web browsers); fall through.
                }
            }

            try {
                const current = await withTimeout(Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced
                }), CURRENT_POSITION_TIMEOUT_MS);
                const point = getCoordinates(current);

                if (point && mountedRef.current) { setCoords(point); }
            } catch (exception) {
                // GPS off, timeout or browser geolocation error: keep the previous fix, if any.
            }
        } finally {
            inFlightRef.current = false;
        }
    }, []);

    const hasCoordsRef = useRef(false);
    hasCoordsRef.current = Boolean(coords);

    useEffect(() => {
        if (!active || permission !== PERMISSION.GRANTED) { return undefined; }

        refresh({ useLastKnown: !hasCoordsRef.current });

        const interval = setInterval(() => refresh({ useLastKnown: false }), POSITION_REFRESH_MS);

        return () => clearInterval(interval);
    }, [ active, permission, refresh ]);

    const requestPermission = useCallback(async () => {
        try {
            const response = await Location.requestForegroundPermissionsAsync();

            if (!mountedRef.current) { return; }

            const next = permissionFromResponse(response);

            // An explicit "no" in the dialog is final for this card: show the hint instead of the button.
            setPermission(next === PERMISSION.GRANTED ? PERMISSION.GRANTED : PERMISSION.DENIED);
        } catch (exception) {
            if (mountedRef.current) { setPermission(PERMISSION.UNAVAILABLE); }
        }
    }, []);

    return { permission, coords, requestPermission };
}

function useClock(active) {
    const [ now, setNow ] = useState(() => dayjs());

    useEffect(() => {
        if (!active) { return undefined; }

        setNow(dayjs());

        const interval = setInterval(() => setNow(dayjs()), CLOCK_TICK_MS);

        return () => clearInterval(interval);
    }, [ active ]);

    return now;
}

const formatTime = instant => (instant && typeof(instant.format) === 'function' ? instant.format('HH:mm') : '');

/**
 * Builds everything the card renders from the raw inputs. Exported for previews/tests.
 *
 * @returns {null|{
 *   walkMinutes:number, meters:number, status:string, slackMinutes:number,
 *   leaveInMinutes:number, target:object|null, targetLeaveAt:object|null,
 *   followingTime:string, followingLeaveInMinutes:number
 * }} null when nothing should be shown.
 */
export function buildWalkEstimate({ from, station, departure, followingDeparture, now }) {
    const meters = distanceMeters(from, station);

    if (!Number.isFinite(meters) || meters > WALK_MAX_DISTANCE_METERS) { return null; }

    const walkMinutes = walkMinutesForDistance(meters);
    const current     = classifyWalk(walkMinutes, departure, now);

    if (!current.status) { return null; }

    const estimate = {
        walkMinutes,
        meters,
        status:                  current.status,
        slackMinutes:            current.slackMinutes,
        leaveInMinutes:          minutesUntil(current.leaveAt, now),
        target:                  departure,
        targetLeaveAt:           current.leaveAt,
        followingTime:           '',
        followingLeaveInMinutes: NaN
    };

    if (current.status === WALK_STATUS.MISSED) {
        const following = followingDeparture ? classifyWalk(walkMinutes, followingDeparture, now) : null;

        if (following && following.status && following.status !== WALK_STATUS.MISSED) {
            estimate.target                  = followingDeparture;
            estimate.targetLeaveAt           = following.leaveAt;
            estimate.followingTime           = formatTime(followingDeparture);
            estimate.followingLeaveInMinutes = minutesUntil(following.leaveAt, now);
        } else {
            estimate.target        = null;
            estimate.targetLeaveAt = null;
        }
    }

    return estimate;
}

const statusCopy = estimate => {
    const { status, slackMinutes, leaveInMinutes, followingTime, followingLeaveInMinutes } = estimate;

    if (status === WALK_STATUS.ON_TIME) {
        return {
            title: Lang.t('walkOnTimeTitle'),
            body:  leaveInMinutes > 0
                ? Lang.t('walkOnTimeBody', { minutes: leaveInMinutes, slack: slackMinutes })
                : Lang.t('walkOnTimeBodyNow', { slack: slackMinutes })
        };
    }

    if (status === WALK_STATUS.TIGHT) {
        return { title: Lang.t('walkTightTitle'), body: Lang.t('walkTightBody') };
    }

    if (followingTime) {
        return {
            title: Lang.t('walkMissedTitle'),
            body:  followingLeaveInMinutes > 0
                ? Lang.t('walkMissedFollowingBody', { time: followingTime, minutes: followingLeaveInMinutes })
                : Lang.t('walkMissedFollowingBodyNow', { time: followingTime })
        };
    }

    return { title: Lang.t('walkMissedTitle'), body: Lang.t('walkMissedNoFollowingBody') };
};

const compactCopy = estimate => {
    const { status, walkMinutes, leaveInMinutes, followingTime } = estimate;

    if (status === WALK_STATUS.ON_TIME) {
        return leaveInMinutes > 0
            ? Lang.t('walkCompactOnTime', { minutes: walkMinutes, leave: leaveInMinutes })
            : Lang.t('walkCompactOnTimeNow', { minutes: walkMinutes });
    }

    if (status === WALK_STATUS.TIGHT) { return Lang.t('walkCompactTight', { minutes: walkMinutes }); }

    return followingTime
        ? Lang.t('walkCompactMissedFollowing', { time: followingTime })
        : Lang.t('walkCompactMissed');
};

const statusTone = (theme, status, compact) => {
    if (status === WALK_STATUS.ON_TIME) {
        // Watch review (W3): green is reserved for "En vivo" on the watch, so the compact
        // variant uses the neutral secondary container instead.
        return compact
            ? { background: theme.roles.secondaryContainer, foreground: theme.roles.onSecondaryContainer, icon: 'walk' }
            : { background: theme.successSurface,           foreground: theme.success,                    icon: 'check-circle' };
    }

    if (status === WALK_STATUS.TIGHT) {
        return { background: theme.warningSurface, foreground: theme.warning, icon: 'run-fast' };
    }

    // MISSED: amber, never the error red.
    return { background: theme.warningSurface, foreground: theme.warning, icon: compact ? 'walk' : 'alert-circle' };
};

/**
 * F2 "¿Llego?": approximate walking time from the user's location to the origin
 * station versus the next departure (llegás / ajustado / no llegás). Always labelled
 * "aprox.".
 *
 * Location: never prompts proactively. If permission is not granted it shows an
 * "Activar ubicación" text button (foreground request only); if denied it shows a small
 * hint (phone) or nothing (watch). Uses the last known fix first, then a balanced fix with
 * a 10 s timeout, refreshed every ~60 s while the screen is focused and the app is active.
 * Renders nothing when the station has no coordinates, the user is > 8 km away, or no fix
 * is available yet.
 *
 * @param {object} props
 * @param {{id:number,title:string,latitude?:number,longitude?:number,lat?:number,lon?:number,center?:{lat:number,lon:number}}} props.station
 *        Origin station (any shape accepted by Walk.getCoordinates, i.e. the raw station JSON works).
 * @param {object} props.departure        dayjs instant of the next departure.
 * @param {object} [props.followingDeparture]  dayjs instant of the one after (shown when "no llegás").
 * @param {Function} [props.onRemindToLeave]   ({ leaveAt, departure, walkMinutes }) => void; shows
 *        "Avisarme cuándo salir" only when the relevant leaveAt is still in the future. When the
 *        next train is missed, `leaveAt`/`departure` refer to `followingDeparture`.
 * @param {boolean} [props.compact]       Watch variant (single line + icon, fits round insets).
 * @param {object}  [props.style]
 * @param {object}  [props.position]      Optional `{ latitude, longitude }` override (previews/tests);
 *        when given, the card skips expo-location entirely.
 * @param {object}  [props.now]           Optional dayjs override for "now" (previews/tests).
 */
export default function WalkEstimateCard({
    station,
    departure,
    followingDeparture,
    onRemindToLeave,
    compact = false,
    style,
    position,
    now: nowOverride
}) {
    const { theme } = useTheme();
    const active     = useIsScreenActive();
    const hasStation = Boolean(getCoordinates(station));
    const usesDevice = hasStation && !position;
    const location   = useWalkPosition(active && usesDevice);
    const clock      = useClock(active && !nowOverride);
    const now        = nowOverride || clock;
    const from       = position || location.coords;

    const estimate = useMemo(
        () => (hasStation && from && departure
            ? buildWalkEstimate({ from, station, departure, followingDeparture, now })
            : null),
        [ hasStation, from, station, departure, followingDeparture, now ]
    );

    if (!hasStation || !departure) { return null; }

    if (usesDevice && location.permission === PERMISSION.ASK) {
        return compact
            ? <CompactLocationButton theme={theme} style={style} onPress={location.requestPermission} />
            : <LocationPrompt theme={theme} style={style} onPress={location.requestPermission} />;
    }

    if (usesDevice && location.permission === PERMISSION.DENIED) {
        if (compact) { return null; }

        return (
            <View style={[ styles.hintRow, style ]}>
                <Icon source="map-marker-off-outline" size={16} color={theme.textMuted} />
                <Text variant="bodySmall" style={[ styles.hintText, { color: theme.textMuted } ]}>
                    {Lang.t('walkLocationDeniedHint')}
                </Text>
            </View>
        );
    }

    if (!estimate) { return null; }

    const tone        = statusTone(theme, estimate.status, compact);
    const canRemind   = Boolean(onRemindToLeave)
        && Boolean(estimate.targetLeaveAt)
        && estimate.targetLeaveAt.valueOf() > now.valueOf();
    const remind      = () => onRemindToLeave({
        leaveAt:     estimate.targetLeaveAt,
        departure:   estimate.target,
        walkMinutes: estimate.walkMinutes
    });

    if (compact) {
        return (
            <View style={[ styles.compactWrapper, style ]}>
                <View
                    accessibilityRole="text"
                    accessibilityLiveRegion="polite"
                    style={[ styles.compactPill, { backgroundColor: tone.background, borderRadius: theme.shape.full } ]}
                >
                    <Icon source={tone.icon} size={20} color={tone.foreground} />
                    <Text
                        variant="labelLarge"
                        numberOfLines={2}
                        style={[ styles.compactText, theme.type.emphasized.label, { color: tone.foreground } ]}
                    >
                        {compactCopy(estimate)}
                    </Text>
                </View>
                {canRemind ? (
                    <Button
                        mode="contained-tonal"
                        icon="bell-outline"
                        compact
                        onPress={remind}
                        accessibilityHint={Lang.t('walkRemindHint', { time: formatTime(estimate.targetLeaveAt) })}
                        style={styles.compactRemindButton}
                        contentStyle={styles.compactButtonContent}
                    >
                        {Lang.t('walkRemindShortBtnLabel')}
                    </Button>
                ) : null}
            </View>
        );
    }

    const copy        = statusCopy(estimate);
    const distance    = formatDistance(estimate.meters, Lang.locale);
    const summary     = distance
        ? Lang.t('walkSummary', { minutes: estimate.walkMinutes, distance })
        : Lang.t('walkSummaryNoDistance', { minutes: estimate.walkMinutes });
    const isOnTime    = estimate.status === WALK_STATUS.ON_TIME;

    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: theme.roles.surfaceContainerLow,
                    borderRadius:    theme.shape.xl,
                    borderColor:     theme.roles.outlineVariant
                },
                style
            ]}
        >
            <View style={styles.headerRow}>
                <View style={[ styles.iconBubble, { backgroundColor: isOnTime ? theme.roles.secondaryContainer : theme.warningSurface } ]}>
                    <Icon source="walk" size={26} color={isOnTime ? theme.roles.onSecondaryContainer : theme.warning} />
                </View>
                <View style={styles.headerText}>
                    <Text variant="titleMedium" style={[ theme.type.emphasized.title, { color: theme.text } ]}>
                        {summary}
                    </Text>
                    {station.title ? (
                        <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.textMuted }}>
                            {Lang.t('walkToStation', { station: station.title })}
                        </Text>
                    ) : null}
                </View>
            </View>

            <View
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                style={[ styles.statusRow, { backgroundColor: tone.background, borderRadius: theme.shape.lg } ]}
            >
                <Icon source={tone.icon} size={22} color={tone.foreground} />
                <View style={styles.statusText}>
                    <Text variant="titleSmall" style={[ theme.type.emphasized.title, { color: tone.foreground } ]}>
                        {copy.title}
                    </Text>
                    <Text variant="bodyMedium" style={{ color: tone.foreground }}>{copy.body}</Text>
                </View>
            </View>

            <Text variant="bodySmall" style={[ styles.footnote, { color: theme.textMuted } ]}>
                {Lang.t('walkApproxFootnote')}
            </Text>

            {canRemind ? (
                <Button
                    mode="contained-tonal"
                    icon="bell-outline"
                    onPress={remind}
                    accessibilityHint={Lang.t('walkRemindHint', { time: formatTime(estimate.targetLeaveAt) })}
                    style={[ styles.remindButton, { borderRadius: theme.shape.full } ]}
                    contentStyle={styles.buttonContent}
                >
                    {Lang.t('walkRemindBtnLabel')}
                </Button>
            ) : null}
        </View>
    );
}

function LocationPrompt({ theme, style, onPress }) {
    return (
        <View
            style={[
                styles.promptRow,
                { backgroundColor: theme.roles.surfaceContainerLow, borderRadius: theme.shape.xl },
                style
            ]}
        >
            <Icon source="walk" size={22} color={theme.textMuted} />
            <Text variant="bodyMedium" style={[ styles.promptText, { color: theme.textMuted } ]}>
                {Lang.t('walkEnableLocationHint')}
            </Text>
            <Button mode="text" icon="map-marker-outline" onPress={onPress} contentStyle={styles.buttonContent}>
                {Lang.t('walkEnableLocationBtnLabel')}
            </Button>
        </View>
    );
}

function CompactLocationButton({ theme, style, onPress }) {
    return (
        <View style={[ styles.compactWrapper, style ]}>
            <TouchableRipple
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={Lang.t('walkEnableLocationBtnLabel')}
                accessibilityHint={Lang.t('walkEnableLocationHint')}
                borderless
                style={[ styles.compactPill, styles.compactLocationButton, { backgroundColor: theme.roles.surfaceContainerHigh, borderRadius: theme.shape.full } ]}
            >
                <View style={styles.compactLocationContent}>
                    <Icon source="map-marker-outline" size={20} color={theme.accent} />
                    <Text variant="labelLarge" numberOfLines={1} style={[ theme.type.emphasized.label, { color: theme.accent } ]}>
                        {Lang.t('walkCompactEnableLocation')}
                    </Text>
                </View>
            </TouchableRipple>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderWidth:  StyleSheet.hairlineWidth,
        padding:      16,
        gap:          12,
        marginBottom: 12
    },
    headerRow: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           12
    },
    iconBubble: {
        width:          48,
        height:         48,
        borderRadius:   24,
        alignItems:     'center',
        justifyContent: 'center'
    },
    headerText: {
        flex: 1,
        gap:  2
    },
    statusRow: {
        flexDirection:     'row',
        alignItems:        'center',
        gap:               12,
        paddingVertical:   12,
        paddingHorizontal: 14
    },
    statusText: {
        flex: 1,
        gap:  2
    },
    footnote: {
        textAlign: 'center'
    },
    remindButton: {
        alignSelf: 'stretch'
    },
    buttonContent: {
        minHeight: 48
    },
    promptRow: {
        flexDirection:     'row',
        flexWrap:          'wrap',
        alignItems:        'center',
        gap:               8,
        paddingVertical:   8,
        paddingHorizontal: 14,
        marginBottom:      12
    },
    promptText: {
        flex:     1,
        minWidth: 160
    },
    hintRow: {
        flexDirection:     'row',
        alignItems:        'center',
        gap:               6,
        paddingHorizontal: 4,
        marginBottom:      8
    },
    hintText: {
        flex: 1
    },
    compactWrapper: {
        width:      '100%',
        alignItems: 'center',
        gap:        6
    },
    // Kept narrower than the flow width so both ends clear the round bezel at 192 dp.
    compactPill: {
        flexDirection:     'row',
        alignItems:        'center',
        justifyContent:    'center',
        gap:               8,
        maxWidth:          '86%',
        minHeight:         44,
        paddingVertical:   6,
        paddingHorizontal: 14
    },
    compactText: {
        flexShrink: 1,
        textAlign:  'center'
    },
    compactLocationButton: {
        minHeight: 52,
        minWidth:  132
    },
    compactLocationContent: {
        flexDirection:  'row',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            8
    },
    compactRemindButton: {
        alignSelf: 'center'
    },
    compactButtonContent: {
        minHeight: 44
    }
});

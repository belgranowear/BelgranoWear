import normalizeSpecialCharacters from 'specialtonormal';

import GestureRecognizer from 'react-native-swipe-gestures';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';

import * as Location from 'expo-location';

import { getPreciseDistance } from 'geolib';

import { MD5 } from 'crypto-js';

import {
  ActivityIndicator,
  Button,
  Icon,
  IconButton,
  Searchbar,
  Text
} from 'react-native-paper';

import OfflineModeHint from './OfflineModeHint';
import { NextSchedulePane } from './NextSchedule';
import RoutineCard from './RoutineCard';
import StartupScreen from './StartupScreen';
import StartupReveal from './layout/StartupReveal';
import { AppScreen, StatusPill, TransitCard, WatchScaleItem, useResponsiveMetrics } from './ui';

import Cache       from '../includes/Cache';
import Lang        from '../includes/Lang';
import Preferences from '../includes/Preferences';
import { useTheme } from '../includes/Theme';
import { getUIPreviewMode, isWatchUIPreview, previewState } from '../includes/UIPreview';
import { isRoundScreen } from '../includes/Device';
import { fetchWithTimeout } from '../includes/Network';
import { nowInArgentina }   from '../includes/Time';

const PROXIMITY_WARNING_METERS = 1200;

const WATCH_FETCH_TIMEOUT_MS              = 6000;
const CACHE_VERIFICATION_CONCURRENCY      = 3;
const HOLIDAYS_CACHE_KEY_PATTERN          = /\/holidays_(\d{4})\.json$/;
const LAST_KNOWN_LOCATION_MAX_AGE_MS      = 5 * 60 * 1000;
const LAST_KNOWN_LOCATION_ACCURACY_METERS = 1000;
// A cold GPS fix on a watch (no assisted location from the network) can take well over 10 s.
const WATCH_GPS_FIX_TIMEOUT_MS = 30 * 1000;

let cacheVerificationInProgress = false;

const formatDistanceKm = meters => (meters / 1000).toFixed(1);

// Trips from the current origin only need the destination; others show the full route.
const quickTripTitle = trip => trip.isCurrentOrigin
    ? trip.destination.title
    : `${trip.origin.title} → ${trip.destination.title}`;

// Lowercase, accent-free text used to filter stations from the search field.
const normalizeSearchText = value => normalizeSpecialCharacters(String(value || '').toLowerCase())
    .replace(/[.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const filterStations = (stations, query) => {
    const needle = normalizeSearchText(query);

    if (!needle) { return stations; }

    return stations.filter(item => normalizeSearchText(item.title).indexOf(needle) > -1);
};

const quickTripAccessibilityLabel = (trip, kind) => Lang.t(kind === 'favorite' ? 'pickerFavoriteTripA11yLabel' : 'pickerRecentTripA11yLabel')
    .replace('%s', `${trip.origin.title} ${Lang.t('to')} ${trip.destination.title}`);

// Watch only: on phones/tablets Settings lives in the header "⋮" menu or the navigation rail.
function SettingsButton({ navigation, compact = false }) {
    const { theme } = useTheme();
    const { isWatch } = useResponsiveMetrics();
    const size      = compact ? 44 : 48;

    if (!isWatch) { return null; }

    return (
        <IconButton
            icon="cog"
            size={compact ? 20 : 24}
            mode="contained-tonal"
            containerColor={theme.roles.surfaceContainerHigh}
            iconColor={theme.paperTheme.colors.onSurfaceVariant}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel={Lang.t('settingsButtonLabel')}
            style={[ styles.settingsButton, { width: size, height: size, borderRadius: size / 2 } ]}
        />
    );
}

// Single origin control for every layout: a compact "Desde · <station> · Cambiar" bar (phone/tablet),
// an inline one-liner for short heights (`dense`) and a centered pill on the watch.
function OriginBar({ station, onChange, navigation, distanceMeters, isOffline, showMaterialYou, variant = 'default', round = false }) {
    const { theme } = useTheme();
    const roles     = theme.roles;
    const title     = station?.title || '';
    const label     = Lang.t('pickerOriginA11yLabel').replace('%s', title);

    const hasDistanceWarning = distanceMeters > PROXIMITY_WARNING_METERS;
    const extras = (hasDistanceWarning || isOffline || showMaterialYou) ? (
        <View style={[ styles.originExtras, variant === 'watch' ? styles.originExtrasWatch : undefined ]}>
            {hasDistanceWarning ? (
                <StatusPill icon="alert" tone="warning">{Lang.t('detectedOriginWarning').replace('%s', formatDistanceKm(distanceMeters))}</StatusPill>
            ) : null}
            <OfflineModeHint navigation={navigation} isOffline={isOffline} />
            {showMaterialYou ? <StatusPill icon="palette" tone="success">{Lang.t('materialYouEnabledLabel')}</StatusPill> : null}
        </View>
    ) : null;

    if (variant === 'watch') {
        return (
            <View style={styles.originWatchWrap}>
                <Pressable
                    onPress={onChange}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    style={({ pressed }) => [
                        styles.originWatch,
                        round ? styles.originWatchRound : undefined,
                        { backgroundColor: pressed ? roles.surfaceContainerHighest : roles.surfaceContainerHigh, borderRadius: theme.shape.full }
                    ]}
                >
                    <Text numberOfLines={1} style={[ styles.originWatchLabel, { color: theme.textMuted } ]}>
                        {Lang.t('fromStationLabel')}
                    </Text>
                    <View style={styles.originWatchTitleRow}>
                        <Icon source="map-marker" size={14} color={theme.textMuted} />
                        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[ styles.originWatchTitle, { color: theme.text } ]}>
                            {title}
                        </Text>
                    </View>
                </Pressable>
                {extras}
            </View>
        );
    }

    const dense = variant === 'dense';

    return (
        <View style={dense ? styles.originDenseWrap : styles.originWrap}>
            <View
                style={[
                    styles.originBar,
                    dense ? styles.originBarDense : undefined,
                    { backgroundColor: roles.surfaceContainerHigh, borderRadius: theme.shape.full }
                ]}
            >
                <View style={[ styles.originAvatar, dense ? styles.originAvatarDense : undefined, { backgroundColor: roles.primaryContainer } ]}>
                    <Icon source="map-marker" size={dense ? 18 : 22} color={roles.onPrimaryContainer} />
                </View>
                {dense ? (
                    <Text numberOfLines={1} style={styles.originDenseText} accessibilityLabel={label}>
                        <Text variant="labelLarge" style={{ color: theme.textMuted }}>{Lang.t('fromStationLabel')} · </Text>
                        <Text variant="titleSmall" style={[ styles.originTitle, theme.type.emphasized.title ]}>{title}</Text>
                    </Text>
                ) : (
                    <View style={styles.originText}>
                        <Text variant="labelMedium" style={{ color: theme.textMuted }}>{Lang.t('fromStationLabel')}</Text>
                        <Text variant="titleMedium" numberOfLines={1} style={[ styles.originTitle, theme.type.emphasized.title ]}>{title}</Text>
                    </View>
                )}
                <Button
                    mode="contained-tonal"
                    compact
                    onPress={onChange}
                    accessibilityLabel={label}
                    style={[ styles.originChangeButton, { borderRadius: theme.shape.full } ]}
                    contentStyle={dense ? styles.originChangeContentDense : styles.originChangeContent}
                >
                    {Lang.t('pickerChangeOriginShortLabel')}
                </Button>
            </View>
            {extras}
        </View>
    );
}

function SectionTitle({ title, icon, compact = false }) {
    const { theme } = useTheme();

    return (
        <View style={[ styles.sectionTitleRow, compact ? styles.sectionTitleRowCompact : undefined ]}>
            {icon ? <Icon source={icon} size={18} color={theme.textMuted} /> : null}
            <Text variant="titleMedium" accessibilityRole="header" style={[ styles.sectionTitle, theme.type.emphasized.title ]}>{title}</Text>
        </View>
    );
}

function InlineEmptyHint({ icon, text }) {
    const { theme } = useTheme();

    return (
        <View style={[ styles.inlineEmpty, { backgroundColor: theme.roles.surfaceContainerLow, borderColor: theme.roles.outlineVariant, borderRadius: theme.shape.lg } ]}>
            <Icon source={icon} size={20} color={theme.textMuted} />
            <Text variant="bodyMedium" style={[ styles.inlineEmptyText, { color: theme.textMuted } ]}>{text}</Text>
        </View>
    );
}

// Favorite (star) and recent (clock) shortcuts shown as horizontal chips/cards on phone and tablet.
function QuickTripChip({ trip, kind, onPress }) {
    const { theme } = useTheme();
    const roles     = theme.roles;
    const favorite  = kind === 'favorite';

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={quickTripAccessibilityLabel(trip, kind)}
            style={({ pressed }) => [
                favorite ? styles.favoriteChip : styles.recentChip,
                {
                    backgroundColor: pressed ? roles.surfaceContainerHighest : roles.surfaceContainerHigh,
                    borderRadius: favorite ? theme.shape.lg : theme.shape.full
                }
            ]}
        >
            {favorite ? (
                <>
                    <View style={styles.favoriteChipIcons}>
                        <Icon source="train" size={22} color={theme.textMuted} />
                        <Icon source="star" size={20} color={roles.primary} />
                    </View>
                    <Text variant="labelLarge" numberOfLines={2} style={styles.quickChipTitle}>{quickTripTitle(trip)}</Text>
                </>
            ) : (
                <>
                    <Icon source="clock-outline" size={20} color={theme.textMuted} />
                    <Text variant="labelLarge" numberOfLines={2} style={[ styles.quickChipTitle, styles.recentChipTitle ]}>{quickTripTitle(trip)}</Text>
                </>
            )}
        </Pressable>
    );
}

// Dense M3 list row (52 dp): leading icon, title, trailing star toggle or chevron. Selection is tonal.
function StationRow({ item, onPress, onFavoritePress, isFavorite, accessibilityHint, selected = false, showDivider = false, leadingIcon = 'train', style }) {
    const { theme } = useTheme();
    const roles     = theme.roles;
    const textColor = selected ? roles.onSecondaryContainer : theme.text;
    const iconColor = selected ? roles.onSecondaryContainer : theme.textMuted;

    return (
        <View style={[ styles.stationRowWrap, style ]}>
            <View style={[ styles.stationRow, { backgroundColor: selected ? roles.secondaryContainer : 'transparent', borderRadius: theme.shape.full } ]}>
                <Pressable
                    onPress={onPress}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    accessibilityHint={accessibilityHint}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                        styles.stationRowMain,
                        { borderRadius: theme.shape.full },
                        pressed && !selected ? { backgroundColor: roles.surfaceContainerHigh } : undefined
                    ]}
                >
                    <Icon source={leadingIcon} size={22} color={iconColor} />
                    <Text variant="bodyLarge" numberOfLines={1} style={[ styles.stationTitle, { color: textColor }, selected ? theme.type.emphasized.title : undefined ]}>
                        {item.title}
                    </Text>
                    {!onFavoritePress ? <Icon source="chevron-right" size={22} color={iconColor} /> : null}
                </Pressable>
                {onFavoritePress ? (
                    <Pressable
                        onPress={onFavoritePress}
                        accessibilityRole="button"
                        accessibilityLabel={`${isFavorite ? Lang.t('removeFavoriteBtnLabel') : Lang.t('addFavoriteBtnLabel')}: ${item.title}`}
                        accessibilityState={{ checked: isFavorite }}
                        hitSlop={4}
                        style={({ pressed }) => [
                            styles.stationStar,
                            pressed ? { backgroundColor: roles.surfaceContainerHighest } : undefined
                        ]}
                    >
                        <Icon source={isFavorite ? 'star' : 'star-outline'} size={22} color={isFavorite ? roles.primary : iconColor} />
                    </Pressable>
                ) : null}
            </View>
            {showDivider ? <View style={[ styles.stationDivider, { backgroundColor: roles.outlineVariant } ]} /> : null}
        </View>
    );
}

// Rows rendered as a single list, or as a grid when the screen is short (phone landscape).
function StationList({ items, renderRow, columns = 1, emptyText }) {
    if (items.length === 0 && emptyText) {
        return <InlineEmptyHint icon="magnify" text={emptyText} />;
    }

    const columnWidth = `${100 / columns}%`;

    return (
        <View style={columns > 1 ? styles.stationGrid : undefined}>
            {items.map((item, index) => renderRow({
                item,
                showDivider: columns === 1 ? index < items.length - 1 : index < items.length - columns,
                style:       columns > 1 ? { width: columnWidth } : undefined
            }))}
        </View>
    );
}

// Watch row: big (≥ 52 dp) pill, narrower on round screens so the bezel never clips it.
// Only a favorite star uses the primary (red) color.
function WatchRow({ title, leadingIcon, onPress, accessibilityLabel, accessibilityHint, star, onStarPress, starLabel, round = false, centered = false }) {
    const { theme } = useTheme();
    const roles     = theme.roles;

    return (
        <View style={[ styles.watchRow, round ? styles.watchRowRound : undefined, { backgroundColor: roles.surfaceContainerHigh, borderRadius: theme.shape.full } ]}>
            <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel || title}
                accessibilityHint={accessibilityHint}
                style={({ pressed }) => [
                    styles.watchRowMain,
                    centered ? styles.watchRowMainCentered : undefined,
                    !star ? styles.watchRowMainNoStar : undefined,
                    { borderRadius: theme.shape.full },
                    pressed ? { backgroundColor: roles.surfaceContainerHighest } : undefined
                ]}
            >
                {leadingIcon ? <Icon source={leadingIcon} size={18} color={theme.textMuted} /> : null}
                <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    style={[ styles.watchRowTitle, centered ? styles.watchRowTitleCentered : undefined, { color: theme.text } ]}
                >
                    {title}
                </Text>
                {star && !onStarPress ? (
                    <Icon source={star === 'on' ? 'star' : 'star-outline'} size={20} color={star === 'on' ? roles.primary : theme.textMuted} />
                ) : null}
            </Pressable>
            {star && onStarPress ? (
                <Pressable
                    onPress={onStarPress}
                    accessibilityRole="button"
                    accessibilityLabel={starLabel}
                    accessibilityState={{ checked: star === 'on' }}
                    style={({ pressed }) => [
                        styles.watchRowStar,
                        pressed ? { backgroundColor: roles.surfaceContainerHighest } : undefined
                    ]}
                >
                    <Icon source={star === 'on' ? 'star' : 'star-outline'} size={22} color={star === 'on' ? roles.primary : theme.textMuted} />
                </Pressable>
            ) : null}
        </View>
    );
}

function WatchSectionLabel({ title }) {
    const { theme } = useTheme();

    return (
        <Text accessibilityRole="header" numberOfLines={1} style={[ styles.watchSectionLabel, { color: theme.textMuted } ]}>{title}</Text>
    );
}

// Tablet/desktop detail pane before a destination is chosen.
function DetailEmptyState({ title, message, shortcuts }) {
    const { theme } = useTheme();
    const roles     = theme.roles;

    return (
        <ScrollView style={styles.fill} contentContainerStyle={styles.detailEmptyContent}>
            <View style={[ styles.detailEmptyCard, { backgroundColor: roles.surfaceContainerLow, borderRadius: theme.shape.xl } ]}>
                <View style={[ styles.detailEmptyIcon, { backgroundColor: roles.secondaryContainer } ]}>
                    <Icon source="train" size={40} color={roles.onSecondaryContainer} />
                </View>
                <Text variant="headlineSmall" accessibilityRole="header" style={[ styles.centerText, theme.type.emphasized.headline ]}>{title}</Text>
                {message ? <Text variant="bodyMedium" style={[ styles.centerText, { color: theme.textMuted } ]}>{message}</Text> : null}
                {shortcuts && shortcuts.length > 0 ? (
                    <View style={styles.detailEmptyShortcuts}>
                        <Text variant="labelLarge" style={[ styles.centerText, { color: theme.textMuted } ]}>{Lang.t('pickerQuickAccessTitle')}</Text>
                        <View style={styles.detailEmptyShortcutList}>
                            {shortcuts.map(({ trip, kind, onPress }) => (
                                <QuickTripChip key={trip.id} trip={trip} kind={kind} onPress={onPress} />
                            ))}
                        </View>
                    </View>
                ) : null}
            </View>
        </ScrollView>
    );
}


export default function DestinationPicker({ navigation }) {
    const responsive = useResponsiveMetrics();
    const { theme, isAndroidDynamicColorAvailable } = useTheme();
    const previewMode = getUIPreviewMode();
    const watchLayout = responsive.isWatch || isWatchUIPreview();
    const tabletTwoPane = responsive.isTwoPane && !watchLayout;
    const watchListEndPadding = watchLayout ? Math.round(responsive.shortestSide * 0.3) : 0;
    const watchRound          = watchLayout && isRoundScreen({ width: responsive.width, height: responsive.height, watch: true });
    // Keeps the "Desde" chip below the round bezel's narrow top; the first list row lands near the center.
    const watchTopPadding     = watchLayout ? Math.round(responsive.shortestSide * (watchRound ? 0.1 : 0.03)) : 0;
    // `isShortHeight` comes from ui.js once the layout agent lands it; until then derive it here (phone landscape).
    const isShortHeight       = !watchLayout && (typeof(responsive.isShortHeight) === 'boolean' ? responsive.isShortHeight : responsive.height <= 480);
    const stationColumns      = isShortHeight && !tabletTwoPane ? (responsive.width >= 840 ? 3 : 2) : 1;

    const [ originStation,              setOriginStation              ] = useState();
    const [ originDistanceMeters,       setOriginDistanceMeters       ] = useState();
    const [ trainStationsMap,           setTrainStationsMap           ] = useState();
    const [ currentOperation,           setCurrentOperation           ] = useState(Lang.t('verifyCachedResourcesMessage') + '…');
    const [ holidaysList,               setHolidaysList               ] = useState();
    const [ loadFinished,               setLoadFinished               ] = useState(false);
    const [ allDestinationsList,        setAllDestinationsList        ] = useState();
    const [ segmentsList,               setSegmentsList               ] = useState();
    const [ crashMessage,               setCrashMessage               ] = useState();
    const [ networkErrorDetected,       setNetworkErrorDetected       ] = useState();
    const [ selectedId,                 setSelectedId                 ] = useState();
    const [ showManualOriginPicker,     setShowManualOriginPicker     ] = useState(false);
    const [ manualOriginReason,         setManualOriginReason         ] = useState();
    const [ favoriteTrips,              setFavoriteTrips              ] = useState([]);
    const [ recentTrips,                setRecentTrips                ] = useState([]);
    const [ tabletDestination,          setTabletDestination          ] = useState();
    const [ offlineDataFetchedAt,       setOfflineDataFetchedAt       ] = useState();
    const [ favoritesVersion,           setFavoritesVersion           ] = useState(0);
    const [ searchQuery,                setSearchQuery                ] = useState('');

    const networkTimeoutMs = watchLayout ? WATCH_FETCH_TIMEOUT_MS : undefined;

    const destinationList = useMemo(() => {
        if (!allDestinationsList) { return []; }
        if (!originStation)       { return allDestinationsList; }

        return allDestinationsList.filter(item => item.id !== originStation.id);
    }, [ allDestinationsList, originStation ]);

    const resolveTrips = trips => {
        if (!allDestinationsList) { return []; }

        return trips
            .map(trip => Preferences.resolveTrip(trip, allDestinationsList))
            .filter(Boolean)
            .filter((trip, index, array) => array.findIndex(candidate => candidate.id === trip.id) === index);
    };

    const resolvedFavoriteTrips = useMemo(() => resolveTrips(favoriteTrips), [ favoriteTrips, allDestinationsList ]);

    const resolvedRecentTrips = useMemo(() => resolveTrips(recentTrips), [ recentTrips, allDestinationsList ]);

    const currentOriginFavoriteDestinationIds = useMemo(() => {
        if (!originStation) { return []; }

        return resolvedFavoriteTrips
            .filter(trip => trip.origin.id === originStation.id)
            .map(trip => trip.destination.id);
    }, [ resolvedFavoriteTrips, originStation ]);

    const favoriteDestinations = useMemo(() => {
        return currentOriginFavoriteDestinationIds
            .map(id => destinationList.find(item => item.id === id))
            .filter(Boolean);
    }, [ currentOriginFavoriteDestinationIds, destinationList ]);

    // Single source for the favorites/recents sections: { id, origin, destination, kind, isCurrentOrigin }.
    const quickTrips = useMemo(() => {
        const isCurrentOrigin = trip => Boolean(originStation) && trip.origin.id === originStation.id;
        const toQuickTrip     = kind => trip => ({
            id:              `${kind}-${trip.id}`,
            origin:          trip.origin,
            destination:     trip.destination,
            kind,
            isCurrentOrigin: isCurrentOrigin(trip)
        });
        const favoriteIds = new Set(resolvedFavoriteTrips.map(trip => trip.id));

        const favorites = [
            ...resolvedFavoriteTrips.filter(isCurrentOrigin),
            ...resolvedFavoriteTrips.filter(trip => !isCurrentOrigin(trip))
        ].map(toQuickTrip('favorite'));

        const recents = resolvedRecentTrips
            .filter(isCurrentOrigin)
            .filter(trip => !favoriteIds.has(trip.id))
            .slice(0, 3)
            .map(toQuickTrip('recent'));

        return [ ...favorites, ...recents ];
    }, [ resolvedFavoriteTrips, resolvedRecentTrips, originStation ]);

    const favoriteQuickTrips = quickTrips.filter(trip => trip.kind === 'favorite');
    const recentQuickTrips   = quickTrips.filter(trip => trip.kind === 'recent');

    const crash = message => { setCrashMessage(message); };

    const refreshPreferences = async () => {
        const [ nextFavoriteTrips, nextRecentTrips ] = await Promise.all([
            Preferences.getFavoriteTrips(),
            Preferences.getRecentTrips()
        ]);

        setFavoriteTrips(nextFavoriteTrips);
        setRecentTrips(nextRecentTrips);
        setFavoritesVersion(version => version + 1);
    };

    // Favorites can change on NextSchedule, so re-read them whenever this screen regains focus.
    useFocusEffect(
        useCallback(() => {
            if (previewMode) { return; }
            refreshPreferences();
        }, [ previewMode ])
    );

    const swipeRightHandler = state => {
        if (!Platform.constants || Platform.constants.uiMode != 'watch') { return; }
        console.debug('swipeRightHandler:', state);
        BackHandler.exitApp();
    };

    // The swipe recognizer's responder would swallow wheel/touch scrolling on web, so it's native-only.
    // Every content branch shares the StartupReveal root, so the first content fades in after the
    // startup screen and later branch switches (manual origin ↔ list) don't fade again.
    const withOptionalSwipeExit = content => {
        if (watchLayout || Platform.OS === 'web') { return <StartupReveal>{content}</StartupReveal>; }

        return (
            <StartupReveal>
                <GestureRecognizer style={styles.fill} onSwipeRight={swipeRightHandler} directionalOffsetThreshold={process.env.EXIT_SWIPE_X_MAX_OFFSET_THRESHOLD}>
                    {content}
                </GestureRecognizer>
            </StartupReveal>
        );
    };

    const verifyCachedResource = async url => {
        let remoteChecksum;

        try {
            let remoteChecksumURL = (
                process.env.REMOTE_BASE_URL + '/' +
                (new URL(url)).pathname
                    .replace(new RegExp('^\/'),    '')
                    .replace(new RegExp('.json$'), '') + '_sum'
            );

            remoteChecksum = (await (await fetchWithTimeout(remoteChecksumURL, {}, networkTimeoutMs)).text()).trim().toLowerCase();
        } catch (exception) {
            // A missing or unreachable checksum means "unknown", keep the cached copy.
            console.debug(`verifyCachedResource: checksum unavailable for "${url}":`, exception);
            return;
        }

        if (!/^[0-9a-f]{32}$/.test(remoteChecksum)) { return; }

        let file = await Cache.get(url);

        if (file === null || MD5( JSON.stringify(file) ).toString() === remoteChecksum) { return; }

        try {
            let prefetchResponse = await fetchWithTimeout(url, {}, networkTimeoutMs),
                prefetchJSON     = await prefetchResponse.json();

            await Cache.set(url, prefetchJSON);
        } catch (prefetchException) {
            console.warn(`verifyCachedResource: prefetch failed for "${url}", keeping cached copy:`, prefetchException);
        }
    };

    const verifyCachedResources = async freshSince => {
        if (cacheVerificationInProgress) { return; }
        cacheVerificationInProgress = true;

        try {
            let oldestHolidaysYear = nowInArgentina().year() - 1,
                cacheKeys          = (await Cache.keys()).filter(key => key.indexOf('http') === 0),
                pendingKeys        = [];

            for (const url of cacheKeys) {
                const holidaysMatch = url.match(HOLIDAYS_CACHE_KEY_PATTERN);

                if (holidaysMatch && parseInt(holidaysMatch[1]) < oldestHolidaysYear) {
                    await Cache.remove(url);
                    continue;
                }

                // Skip entries already refreshed from the network during this startup.
                if ((await Cache.getFetchedAt(url) ?? 0) >= freshSince) { continue; }

                pendingKeys.push(url);
            }

            const verifyPendingKeys = async () => {
                while (pendingKeys.length > 0) {
                    const url = pendingKeys.shift();

                    try {
                        await verifyCachedResource(url);
                    } catch (exception) {
                        console.warn(`verifyCachedResources: couldn't verify "${url}":`, exception);
                    }
                }
            };

            await Promise.all(Array.from({ length: CACHE_VERIFICATION_CONCURRENCY }, verifyPendingKeys));
        } catch (exception) {
            console.warn('verifyCachedResources: couldn\'t query:', exception);
        } finally {
            cacheVerificationInProgress = false;
        }
    };

    const loadTrainStationsMap = json => {
        let newTrainStationsMap = [];

        json.elements.forEach(station => {
            if (typeof(station.tags.name) == 'undefined') { return; }
            if (((typeof(station.lat) == 'undefined' || typeof(station.lon) == 'undefined')) && typeof(station.center) == 'undefined') { return; }

            const railway = station.tags.railway;
            const publicTransport = station.tags.public_transport;
            if ([ 'station', 'halt' ].indexOf(railway) === -1 && [ 'station', 'stop_area' ].indexOf(publicTransport) === -1) { return; }

            newTrainStationsMap.push({
                name:      station.tags.name.replace(/ \(.*\)/, ''),
                shortName: station.tags.short_name,
                latitude:  (station.lat ?? station.center.lat),
                longitude: (station.lon ?? station.center.lon)
            });
        });

        setTrainStationsMap(newTrainStationsMap);
    };

    // Resolves true when the resource came from the network, false when it fell back to cache (or failed).
    const fetchJSONWithCache = async ({ url, onLoad, errorMessage, operationMessage, onUnavailable }) => {
        setCurrentOperation( operationMessage + '…' );

        try {
            const response = await fetchWithTimeout(url, {}, networkTimeoutMs);
            const json     = await response.json();

            onLoad(json);
            await Cache.set(url, json);
            return true;
        } catch (exception) {
            console.warn(`fetchJSONWithCache: couldn't query ${url}:`, exception);
        }

        try {
            const cachedData = await Cache.get(url);

            if (cachedData !== null) {
                onLoad(cachedData);
                setNetworkErrorDetected(true);

                const fetchedAt = await Cache.getFetchedAt(url);
                if (fetchedAt !== null) {
                    setOfflineDataFetchedAt(previous => previous ? Math.min(previous, fetchedAt) : fetchedAt);
                }

                return false;
            }
        } catch (cacheException) {
            console.error(`fetchJSONWithCache: couldn't load cached ${url}:`, cacheException);
        }

        if (onUnavailable) {
            await onUnavailable();
            return false;
        }

        console.error(`fetchJSONWithCache: no data available for ${url}`);
        crash(errorMessage);
        return false;
    };

    const showManualOriginPickerFallback = (reason = Lang.t('manualOriginFallbackMessage')) => {
        setManualOriginReason(reason);
        setShowManualOriginPicker(true);
    };

    const fetchTrainStationsMap = async () => await fetchJSONWithCache({
        url:              process.env.REMOTE_BASE_URL + '/train_stations.json',
        onLoad:           loadTrainStationsMap,
        errorMessage:     Lang.t('fetchTrainStationsMapError'),
        operationMessage: Lang.t('fetchingTrainStationsMapMessage'),
        // Without the map GPS detection can't work; detectOriginStation goes to the manual picker.
        onUnavailable:    () => {
            setNetworkErrorDetected(true);
            setTrainStationsMap(null);
        }
    });

    const loadFallbackHolidaysList = async () => {
        setNetworkErrorDetected(true);

        try {
            const holidaysKeys = (await Cache.keys())
                .filter(key => key.indexOf(process.env.REMOTE_BASE_URL) === 0 && HOLIDAYS_CACHE_KEY_PATTERN.test(key))
                .sort((a, b) => parseInt(b.match(HOLIDAYS_CACHE_KEY_PATTERN)[1]) - parseInt(a.match(HOLIDAYS_CACHE_KEY_PATTERN)[1]));

            for (const key of holidaysKeys) {
                const cachedHolidays = await Cache.get(key);

                if (Array.isArray(cachedHolidays)) {
                    console.warn(`loadFallbackHolidaysList: using cached "${key}"`);
                    setHolidaysList(cachedHolidays);
                    return;
                }
            }
        } catch (exception) {
            console.warn('loadFallbackHolidaysList: couldn\'t read cached holidays:', exception);
        }

        setHolidaysList([]);
    };

    const fetchHolidaysList = async () => await fetchJSONWithCache({
        url:              process.env.REMOTE_BASE_URL + `/holidays_${nowInArgentina().year()}.json`,
        onLoad:           setHolidaysList,
        errorMessage:     Lang.t('fetchHolidaysListError'),
        operationMessage: Lang.t('fetchingHolidaysListMessage'),
        onUnavailable:    loadFallbackHolidaysList
    });

    const loadAvailabilityOptions = json => {
        let newDestinationsList = [];

        Object.keys(json.destination).forEach(key => {
            newDestinationsList.push({ id: key, title: json.destination[key] });
        });

        setSegmentsList(json.scheduleSegment);
        setAllDestinationsList(newDestinationsList);
    };

    const fetchAvailabilityOptions = async () => await fetchJSONWithCache({
        url:              process.env.REMOTE_BASE_URL + '/availability_options.json',
        onLoad:           loadAvailabilityOptions,
        errorMessage:     Lang.t('fetchAvailabilityOptionsError'),
        operationMessage: Lang.t('fetchingAvailabilityOptionsMessage')
    });

    const tryGetCurrentPositionAsync = (timeout, accuracy) => new Promise(async (resolve, reject) => {
        timeout = parseInt(timeout);
        const timeoutHandle = setTimeout(() => reject(new Error(`Couldn't get GPS location after ${timeout / 1000} seconds.`)), timeout);

        try {
            const location = await Location.getCurrentPositionAsync(accuracy ? { accuracy, mayShowUserSettingsDialog: false } : undefined);
            clearTimeout(timeoutHandle);
            resolve(location);
        } catch (exception) {
            clearTimeout(timeoutHandle);
            reject(exception);
        }
    });

    const tryGetLastKnownPositionAsync = timeout => new Promise(async (resolve, reject) => {
        timeout = parseInt(timeout);
        const timeoutHandle = setTimeout(() => reject(new Error(`Couldn't get GPS location after ${timeout / 1000} seconds.`)), timeout);

        try {
            // Resolves null when the last fix is older or less accurate than allowed.
            const location = await Location.getLastKnownPositionAsync({
                maxAge:           LAST_KNOWN_LOCATION_MAX_AGE_MS,
                requiredAccuracy: LAST_KNOWN_LOCATION_ACCURACY_METERS
            });
            clearTimeout(timeoutHandle);
            resolve(location);
        } catch (exception) {
            clearTimeout(timeoutHandle);
            reject(exception);
        }
    });

    const areLocationPermissionsGranted = async () => {
        if (Platform.OS === 'android' && Platform.Version < 23) { return true; }

        let status;

        try {
            ({ status } = await Location.requestForegroundPermissionsAsync());
        } catch (exception) {
            console.error('areLocationPermissionsGranted:', exception);
            showManualOriginPickerFallback();
            return false;
        }

        if (status !== 'granted') {
          setManualOriginReason( Lang.t('locationAccessDeniedMessage') );
          setShowManualOriginPicker(true);
          return false;
        }

        return true;
    };

    const normalizeStationText = value => normalizeSpecialCharacters(String(value || '').toLowerCase())
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[.,]/g, ' ')
        .replace(/\bestacion\b/g, ' ')
        .replace(/\bciudad\b/g, ' ')
        .replace(/\bsourdeaux\b/g, 'sordeaux')
        .replace(/\s+/g, ' ')
        .trim();

    const buildOriginStationNameCandidates = station => {
        const candidates = [];

        [ station.name, station.shortName ].forEach(name => {
            const normalizedName = normalizeStationText(name);
            if (!normalizedName) { return; }

            candidates.push(normalizedName);

            const split = normalizedName.split(' ');
            if (split.length > 1) { candidates.push(split[split.length - 1]); }
        });

        return [ ...new Set(candidates) ];
    };

    const detectOriginStation = async () => {
        setCurrentOperation( Lang.t('detectingOriginStationMessage') + '…' );

        if (!Array.isArray(trainStationsMap) || trainStationsMap.length === 0) {
            showManualOriginPickerFallback();
            return;
        }

        if (!await areLocationPermissionsGranted()) { return; }

        // With the system location switch off no fix (current or last known) is ever returned, so
        // say so instead of the generic "couldn't detect" message.
        const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
        if (!servicesEnabled) {
            setManualOriginReason( Lang.t('locationServicesDisabledMessage') );
            setShowManualOriginPicker(true);
            return;
        }

        let location;

        try {
            // Watches usually have no network location provider. With it off, expo-location first
            // runs Play Services' "improve accuracy" settings check, which Wear OS rejects (status
            // 10) before any request is made; so skip that check, ask for a GPS fix and give it time.
            location = watchLayout
                ? await tryGetCurrentPositionAsync(WATCH_GPS_FIX_TIMEOUT_MS, Location.Accuracy.High)
                : await tryGetCurrentPositionAsync(process.env.GPS_FIX_TIMEOUT);
        } catch (exception) {
            console.warn('detectOriginStation: no current position, trying the last known one:', exception?.message || exception);

            try {
                location = await tryGetLastKnownPositionAsync(process.env.GPS_FIX_TIMEOUT);
            } catch (lastKnownException) {
                console.error('detectOriginStation:', exception, lastKnownException);
                setManualOriginReason( Lang.t('manualOriginFallbackMessage') );
                setShowManualOriginPicker(true);
                return;
            }
        }

        if (!location) {
            setManualOriginReason( Lang.t('manualOriginFallbackMessage') );
            setShowManualOriginPicker(true);
            return;
        }

        if (!location.coords || !Number.isFinite(location.coords.latitude) || !Number.isFinite(location.coords.longitude)) {
            setManualOriginReason( Lang.t('manualOriginFallbackMessage') );
            setShowManualOriginPicker(true);
            return;
        }

        try {
            let closestDistanceMeters = null,
                closestOriginNames    = null;

            for (let index = 0; index < trainStationsMap.length; index++) {
                let station = trainStationsMap[index],
                    currentDistance = getPreciseDistance(station, location.coords);

                if (closestDistanceMeters === null || currentDistance < closestDistanceMeters) {
                    closestOriginNames = buildOriginStationNameCandidates(station);
                    closestDistanceMeters = currentDistance;
                }
            }

            if (closestOriginNames === null) {
                setManualOriginReason( Lang.t('originDetectionErrorMessage') );
                setShowManualOriginPicker(true);
                return;
            }

            let mappedDestinations = {};
            allDestinationsList.forEach(destination => {
                if (destination.id !== null) { mappedDestinations[destination.id] = normalizeStationText(destination.title); }
            });

            let nextOriginStation = null;
            Object.keys(mappedDestinations).forEach(destination => {
                const destinationTitle = mappedDestinations[destination];
                if (closestOriginNames.some(name => destinationTitle === name || destinationTitle.indexOf(` ${name}`) > -1 || destinationTitle.indexOf(`${name} `) > -1)) {
                    nextOriginStation = allDestinationsList.find(item => item.id === destination);
                }
            });

            if (nextOriginStation === null) {
                setManualOriginReason( Lang.t('originDetectionErrorMessage') );
                setShowManualOriginPicker(true);
                return;
            }

            setOriginDistanceMeters(closestDistanceMeters);
            setOriginStation(nextOriginStation);
        } catch (exception) {
            console.error('detectOriginStation: couldn\'t map location to origin station:', exception);
            setManualOriginReason( Lang.t('originDetectionErrorMessage') );
            setShowManualOriginPicker(true);
        }
    };

    const selectOrigin = station => {
        setOriginStation(station);
        setOriginDistanceMeters(undefined);
        setTabletDestination(undefined);
        setSelectedId(undefined);
        setShowManualOriginPicker(false);
        setSearchQuery('');
        setLoadFinished(true);
        if (!previewMode) { refreshPreferences(); }
    };

    const goToDestination = async (item, origin = originStation) => {
        setSelectedId(item.id);

        if (!originStation || origin.id !== originStation.id) {
            setOriginStation(origin);
            setOriginDistanceMeters(undefined);
            setShowManualOriginPicker(false);
        }

        if (tabletTwoPane) { setTabletDestination(item); }

        await Preferences.recordRecentTrip(origin, item);
        await refreshPreferences();

        if (tabletTwoPane) { return; }

        navigation.navigate('NextSchedule', {
            origin:       origin,
            destination:  item,
            segmentsList: segmentsList,
            holidaysList: holidaysList
        });
    };

    // Opens a favorite/recent trip, switching origin too when it belongs to another station.
    const openTrip = trip => goToDestination(trip.destination, trip.origin);

    const toggleFavorite = async item => {
        if (!originStation) { return; }

        const shouldBeFavorite = currentOriginFavoriteDestinationIds.indexOf(item.id) === -1;
        const trip             = Preferences.buildTrip(originStation, item);

        setFavoriteTrips(previousTrips => {
            const otherTrips = previousTrips.filter(entry => !Preferences.isSameTrip(entry, trip));

            return shouldBeFavorite ? [ trip, ...otherTrips ] : otherTrips;
        });

        try {
            await Preferences.setFavoriteTrip(originStation, item, shouldBeFavorite);
        } catch (exception) {
            console.warn('toggleFavorite: couldn\'t update favorite trip:', exception);
        }

        await refreshPreferences();
    };

    const retryStartup = async () => {
        setCrashMessage(undefined);
        setLoadFinished(false);
        setShowManualOriginPicker(false);
        setManualOriginReason(undefined);
        setOriginStation(undefined);
        setTrainStationsMap(undefined);
        setAllDestinationsList(undefined);
        await bootstrap();
    };

    const bootstrap = async () => {
        const bootstrapStartedAt = Date.now();

        setNetworkErrorDetected(false);
        setOfflineDataFetchedAt(undefined);

        try {
            await refreshPreferences();
        } catch (exception) {
            console.warn('bootstrap: couldn\'t load preferences:', exception);
        }

        try {
            const fetchedFromNetwork = await Promise.all([ fetchTrainStationsMap(), fetchHolidaysList(), fetchAvailabilityOptions() ]);

            if (fetchedFromNetwork.every(Boolean)) { setNetworkErrorDetected(false); }

            // Checksums are verified in the background once the app is usable, only if the network answered.
            if (fetchedFromNetwork.some(Boolean)) {
                verifyCachedResources(bootstrapStartedAt).catch(exception => console.warn('bootstrap: verifyCachedResources:', exception));
            }
        } catch (exception) {
            console.error('bootstrap:', exception);
            crash(Lang.t('fetchAvailabilityOptionsError'));
        }
    };

    useEffect(() => {
        if (previewMode) {
            setAllDestinationsList(previewState.stations);
            setSegmentsList({ 1: 'Lunes a viernes', 2: 'Sábado', 3: 'Domingo' });
            setHolidaysList([]);
            setFavoriteTrips(previewState.favorites);
            setRecentTrips(previewState.recents);
            setCurrentOperation(Lang.t('fetchingAvailabilityOptionsMessage') + '…');

            if (previewMode === 'manual' || previewMode === 'watch-manual') {
                setManualOriginReason(Lang.t('manualOriginFallbackMessage'));
                setShowManualOriginPicker(true);
                return;
            }

            if (previewMode === 'loading' || previewMode === 'watch-loading') { return; }

            setOriginStation(previewState.origin);
            setOriginDistanceMeters(450);
            setLoadFinished(true);
            return;
        }

        bootstrap();
    }, []);

    useEffect(() => {
        if (typeof(originStation) == 'undefined') { return; }
        setLoadFinished(true);
    }, [ originStation ]);

    useEffect(() => {
        if (typeof(trainStationsMap) == 'undefined' || typeof(allDestinationsList) == 'undefined' || typeof(originStation) != 'undefined' || showManualOriginPicker || previewMode) { return; }

        detectOriginStation().catch(exception => {
            console.error('detectOriginStation: unexpected failure:', exception);
            showManualOriginPickerFallback();
        });
    }, [ trainStationsMap, allDestinationsList, showManualOriginPicker ]);

    useEffect(() => {
        if (!tabletTwoPane || !originStation || showManualOriginPicker) { return; }

        const currentDestinationIsValid = tabletDestination
            && destinationList.some(item => item.id === tabletDestination.id)
            && tabletDestination.id !== originStation.id;

        if (currentDestinationIsValid) {
            setSelectedId(tabletDestination.id);
            return;
        }

        // Only a favorite is opened automatically; otherwise the detail pane shows its empty state.
        const nextDestination = favoriteDestinations[0];

        if (nextDestination) {
            setTabletDestination(nextDestination);
            setSelectedId(nextDestination.id);
        }
    }, [ tabletTwoPane, originStation, showManualOriginPicker, destinationList, favoriteDestinations, tabletDestination ]);

    // Opens the route of a tapped departure reminder (cold or warm start) once stations and schedules are loaded.
    useEffect(() => {
        if (!allDestinationsList || !segmentsList || typeof(holidaysList) == 'undefined' || previewMode) { return; }

        const Reminders = require('../includes/Reminders').default;

        return Reminders.onRouteRequested(({ originId, destinationId }) => {
            const routeOrigin      = allDestinationsList.find(item => String(item.id) === originId);
            const routeDestination = allDestinationsList.find(item => String(item.id) === destinationId);

            if (!routeOrigin || !routeDestination) { return; }
            if (navigation.canGoBack()) { navigation.popToTop(); }

            if (tabletTwoPane) {
                replaceTabletRoute({ origin: routeOrigin, destination: routeDestination });
                return;
            }

            navigation.navigate('NextSchedule', { origin: routeOrigin, destination: routeDestination, segmentsList, holidaysList });
        });
    }, [ allDestinationsList, segmentsList, holidaysList, tabletTwoPane ]);

    const replaceTabletRoute = nextRoute => {
        setOriginStation(nextRoute.origin);
        setOriginDistanceMeters(undefined);
        setTabletDestination(nextRoute.destination);
        setSelectedId(nextRoute.destination.id);
        setShowManualOriginPicker(false);
        if (!previewMode) { refreshPreferences(); }
    };

    const openManualOriginPicker = () => {
        setSearchQuery('');
        setShowManualOriginPicker(true);
    };

    const isFavoriteDestination = item => currentOriginFavoriteDestinationIds.indexOf(item.id) > -1;

    const renderDestinationRow = ({ item, showDivider, style }) => (
        <StationRow
            key={item.id}
            item={item}
            onPress={() => goToDestination(item)}
            accessibilityHint={Lang.t('selectThisDestinationHint').replace('%s', item.title)}
            onFavoritePress={() => toggleFavorite(item)}
            isFavorite={isFavoriteDestination(item)}
            selected={item.id === selectedId}
            showDivider={showDivider}
            style={style}
        />
    );

    const renderOriginRow = ({ item, showDivider, style }) => (
        <StationRow
            key={item.id}
            item={item}
            leadingIcon="map-marker-outline"
            onPress={() => selectOrigin(item)}
            accessibilityHint={Lang.t('selectThisOriginHint').replace('%s', item.title)}
            showDivider={showDivider}
            style={style}
        />
    );

    const renderSearchBar = () => (
        <Searchbar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={Lang.t('pickerSearchPlaceholder')}
            accessibilityLabel={Lang.t('pickerSearchPlaceholder')}
            mode="bar"
            elevation={0}
            style={[ styles.searchBar, { backgroundColor: theme.roles.surfaceContainerHigh, borderRadius: theme.shape.full } ]}
        />
    );

    const searchEmptyText = Lang.t('pickerSearchEmpty').replace('%s', searchQuery.trim());

    const renderWatchItems = (items, renderItem) => items.map(item => (
        <WatchScaleItem key={item.id} maxScale={1}>
            {renderItem(item)}
        </WatchScaleItem>
    ));

    const renderWatchFooter = () => (
        <>
            <WatchScaleItem maxScale={1} style={styles.watchSettingsFooter}>
                <SettingsButton navigation={navigation} compact />
            </WatchScaleItem>
            <View style={{ height: watchListEndPadding }} />
        </>
    );

    const showingStartup = !crashMessage && (previewMode === 'loading' || (!loadFinished && !showManualOriginPicker));

    // The startup screen is full-bleed (mirrors the native launch screen): no app bar until content.
    useEffect(() => {
        navigation.setOptions({ headerShown: showingStartup ? false : !(watchLayout || responsive.hasNavigationRail) });
    }, [ showingStartup, watchLayout, responsive.hasNavigationRail ]);

    if (crashMessage) {
        return withOptionalSwipeExit(
                <AppScreen>
                    <TransitCard>
                        <Text variant="titleMedium" style={styles.centerText}>{crashMessage}</Text>
                        <Button mode="contained" onPress={retryStartup}>{Lang.t('retryBtnLabel')}</Button>
                    </TransitCard>
                </AppScreen>
        );
    }

    if (showingStartup) {
        return <StartupScreen operation={currentOperation} />;
    }

    if (showManualOriginPicker && !tabletTwoPane) {
        const manualReason = manualOriginReason || Lang.t('manualOriginFallbackMessage');

        if (watchLayout) {
            return withOptionalSwipeExit(
                <AppScreen contentStyle={[ styles.watchContent, { paddingTop: watchTopPadding } ]}>
                    <WatchScaleItem maxScale={1}>
                        <View style={styles.manualOriginHeaderWatch}>
                            <Text accessibilityRole="header" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} style={[ styles.manualOriginTitleWatch, { color: theme.text } ]}>
                                {Lang.t('chooseOriginHint')}
                            </Text>
                            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.72} style={[ styles.manualOriginReasonWatch, { color: theme.textMuted } ]}>
                                {manualReason}
                            </Text>
                        </View>
                    </WatchScaleItem>
                    {renderWatchItems(allDestinationsList || [], item => (
                        <WatchRow
                            title={item.title}
                            round={watchRound}
                            centered
                            onPress={() => selectOrigin(item)}
                            accessibilityHint={Lang.t('selectThisOriginHint').replace('%s', item.title)}
                        />
                    ))}
                    {renderWatchFooter()}
                </AppScreen>
            );
        }

        const originStations = filterStations(allDestinationsList || [], searchQuery);

        return withOptionalSwipeExit(
                <AppScreen contentStyle={[ styles.stackGap, isShortHeight ? styles.stackGapShort : undefined ]}>
                    <View style={styles.screenHeader}>
                        <View style={styles.headerTitleBlock}>
                            <Text variant={isShortHeight ? 'titleLarge' : 'headlineMedium'} accessibilityRole="header" style={[ styles.headerTitle, theme.type.emphasized.headline ]}>
                                {Lang.t('pickerOriginTitle')}
                            </Text>
                            <Text variant="bodyMedium" style={{ color: theme.textMuted }}>{manualReason}</Text>
                        </View>
                        <SettingsButton navigation={navigation} />
                    </View>
                    {renderSearchBar()}
                    <StationList items={originStations} renderRow={renderOriginRow} columns={stationColumns} emptyText={searchEmptyText} />
                </AppScreen>
        );
    }

    const originBarProps = {
        station:         originStation,
        onChange:        openManualOriginPicker,
        navigation:      navigation,
        distanceMeters:  originDistanceMeters,
        isOffline:       networkErrorDetected,
        showMaterialYou: isAndroidDynamicColorAvailable
    };

    const filteredDestinations = filterStations(destinationList, searchQuery);

    const routineCard = (
        <RoutineCard
            recentTrips={recentTrips}
            onOpenTrip={({ origin, destination }) => goToDestination(destination, origin)}
            onOpenReminders={() => navigation.navigate('Reminders')}
            compact={watchLayout}
        />
    );

    // Favorites and recents as two separate sections, each with its own empty state.
    const renderQuickSections = () => [
        { key: 'favorite', title: Lang.t('favoritesSectionTitle'), icon: 'star-outline',  trips: favoriteQuickTrips, empty: Lang.t('pickerFavoritesEmpty') },
        { key: 'recent',   title: Lang.t('pickerRecentsTitle'),     icon: 'clock-outline', trips: recentQuickTrips,   empty: Lang.t('pickerRecentsEmpty')   }
    ].map(section => (
        <View key={section.key} style={styles.section}>
            <SectionTitle title={section.title} compact={isShortHeight} />
            {section.trips.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickTripList}>
                    {section.trips.map(trip => (
                        <QuickTripChip key={trip.id} trip={trip} kind={section.key} onPress={() => openTrip(trip)} />
                    ))}
                </ScrollView>
            ) : (
                <InlineEmptyHint icon={section.icon} text={section.empty} />
            )}
        </View>
    ));

    const renderAllStations = () => (
        <View style={styles.section}>
            <SectionTitle title={Lang.t('pickerAllStationsTitle')} compact={isShortHeight} />
            <StationList items={filteredDestinations} renderRow={renderDestinationRow} columns={stationColumns} emptyText={searchEmptyText} />
        </View>
    );

    if (tabletTwoPane) {
        const isChoosingTabletOrigin = showManualOriginPicker || !originStation;
        const canShowTabletSchedule  = !isChoosingTabletOrigin && tabletDestination && originStation.id !== tabletDestination.id;
        const detailShortcuts = [
            ...favoriteQuickTrips.map(trip => ({ trip, kind: 'favorite', onPress: () => openTrip(trip) })),
            ...recentQuickTrips.map(trip => ({ trip, kind: 'recent', onPress: () => openTrip(trip) }))
        ];

        // Master and detail scroll independently (each pane is a bounded flex:1/minHeight:0 column).
        return withOptionalSwipeExit(
            <AppScreen scroll={false} contentWidth="split" contentStyle={styles.tabletShell}>
                <View style={[ styles.tabletMasterPane, { width: responsive.tabletMasterWidth } ]}>
                    <View style={styles.screenHeader}>
                        <View style={styles.headerTitleBlock}>
                            <Text variant="headlineSmall" accessibilityRole="header" style={[ styles.headerTitle, theme.type.emphasized.headline ]}>
                                {isChoosingTabletOrigin ? Lang.t('pickerOriginTitle') : Lang.t('pickerTitle')}
                            </Text>
                            {isChoosingTabletOrigin ? (
                                <Text variant="bodyMedium" numberOfLines={3} style={{ color: theme.textMuted }}>
                                    {manualOriginReason || Lang.t('manualOriginFallbackMessage')}
                                </Text>
                            ) : null}
                        </View>
                        <SettingsButton navigation={navigation} />
                    </View>

                    <ScrollView
                        style={styles.fill}
                        contentContainerStyle={styles.tabletMasterContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator
                    >
                        {isChoosingTabletOrigin ? (
                            <>
                                {renderSearchBar()}
                                <StationList items={filterStations(allDestinationsList || [], searchQuery)} renderRow={renderOriginRow} emptyText={searchEmptyText} />
                            </>
                        ) : (
                            <>
                                <OriginBar {...originBarProps} />
                                {routineCard}
                                {renderQuickSections()}
                                {renderSearchBar()}
                                {renderAllStations()}
                            </>
                        )}
                    </ScrollView>
                </View>

                <View style={styles.tabletDetailPane}>
                    {canShowTabletSchedule ? (
                        <NextSchedulePane
                            key={`${originStation.id}:${tabletDestination.id}`}
                            navigation={navigation}
                            origin={originStation}
                            destination={tabletDestination}
                            segmentsList={segmentsList}
                            holidaysList={holidaysList}
                            onReplaceRoute={replaceTabletRoute}
                            onFavoriteChange={refreshPreferences}
                            favoritesVersion={favoritesVersion}
                            forcePreviewData={Boolean(previewMode)}
                        />
                    ) : (
                        <DetailEmptyState
                            title={isChoosingTabletOrigin ? Lang.t('chooseOriginHint') : Lang.t('pickerDetailEmptyTitle')}
                            message={isChoosingTabletOrigin ? null : Lang.t('pickerDetailEmptyMessage')}
                            shortcuts={isChoosingTabletOrigin ? [] : detailShortcuts}
                        />
                    )}
                </View>
            </AppScreen>
        );
    }

    // Watch (W1): Desde chip → Favoritos → Recientes → Todas, all inside the round-safe flow width.
    if (watchLayout) {
        return withOptionalSwipeExit(
            <AppScreen contentStyle={[ styles.watchContent, { paddingTop: watchTopPadding } ]}>
                <WatchScaleItem maxScale={1}>
                    <OriginBar {...originBarProps} variant="watch" round={watchRound} />
                </WatchScaleItem>

                {routineCard}

                {favoriteQuickTrips.length > 0 ? (
                    <>
                        <WatchScaleItem maxScale={1}><WatchSectionLabel title={Lang.t('favoritesSectionTitle')} /></WatchScaleItem>
                        {renderWatchItems(favoriteQuickTrips, trip => (
                            <WatchRow
                                title={quickTripTitle(trip)}
                                leadingIcon="train"
                                star="on"
                                round={watchRound}
                                onPress={() => openTrip(trip)}
                                accessibilityLabel={quickTripAccessibilityLabel(trip, 'favorite')}
                            />
                        ))}
                    </>
                ) : null}

                {recentQuickTrips.length > 0 ? (
                    <>
                        <WatchScaleItem maxScale={1}><WatchSectionLabel title={Lang.t('pickerRecentsTitle')} /></WatchScaleItem>
                        {renderWatchItems(recentQuickTrips, trip => (
                            <WatchRow
                                title={quickTripTitle(trip)}
                                leadingIcon="clock-outline"
                                round={watchRound}
                                onPress={() => openTrip(trip)}
                                accessibilityLabel={quickTripAccessibilityLabel(trip, 'recent')}
                            />
                        ))}
                    </>
                ) : null}

                <WatchScaleItem maxScale={1}><WatchSectionLabel title={Lang.t('pickerAllStationsTitle')} /></WatchScaleItem>
                {renderWatchItems(destinationList, item => {
                    const favorite = isFavoriteDestination(item);

                    return (
                        <WatchRow
                            title={item.title}
                            leadingIcon="train"
                            star={favorite ? 'on' : 'off'}
                            round={watchRound}
                            onPress={() => goToDestination(item)}
                            accessibilityHint={Lang.t('selectThisDestinationHint').replace('%s', item.title)}
                            onStarPress={() => toggleFavorite(item)}
                            starLabel={`${favorite ? Lang.t('removeFavoriteBtnLabel') : Lang.t('addFavoriteBtnLabel')}: ${item.title}`}
                        />
                    );
                })}

                {renderWatchFooter()}
            </AppScreen>
        );
    }

    return withOptionalSwipeExit(
            <AppScreen contentStyle={[ styles.stackGap, isShortHeight ? styles.stackGapShort : undefined ]}>
                <View style={styles.screenHeader}>
                    <Text
                        variant={isShortHeight ? 'titleLarge' : 'headlineMedium'}
                        accessibilityRole="header"
                        numberOfLines={1}
                        style={[ styles.headerTitle, isShortHeight ? styles.headerTitleShort : styles.headerTitleBlock, theme.type.emphasized.headline ]}
                    >
                        {Lang.t('pickerTitle')}
                    </Text>
                    {isShortHeight ? <OriginBar {...originBarProps} variant="dense" /> : null}
                    <SettingsButton navigation={navigation} />
                </View>

                {!isShortHeight ? <OriginBar {...originBarProps} /> : null}

                {routineCard}

                {isShortHeight ? (
                    <View style={styles.shortQuickRow}>
                        {renderQuickSections().map(section => (
                            <View key={section.key} style={styles.shortQuickColumn}>{section}</View>
                        ))}
                    </View>
                ) : renderQuickSections()}

                {renderSearchBar()}
                {renderAllStations()}
            </AppScreen>
    );
}

const styles = StyleSheet.create({
    fill: {
        flex: 1,
        minHeight: 0
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center'
    },
    centerText: {
        textAlign: 'center'
    },
    loadingCard: {
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center'
    },
    stackGap: {
        gap: 16
    },
    stackGapShort: {
        gap: 10
    },
    screenHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
    },
    headerTitleBlock: {
        flex: 1,
        minWidth: 0
    },
    headerTitle: {
        fontWeight: '800'
    },
    headerTitleShort: {
        flexShrink: 1
    },
    settingsButton: {
        margin: 0
    },

    // Origin bar.
    originWrap: {
        gap: 8
    },
    originDenseWrap: {
        flex: 1,
        minWidth: 0,
        gap: 4
    },
    originBar: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingLeft: 8,
        paddingRight: 8,
        paddingVertical: 8
    },
    originBarDense: {
        minHeight: 48,
        gap: 8,
        paddingLeft: 6,
        paddingRight: 6,
        paddingVertical: 4
    },
    originAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center'
    },
    originAvatarDense: {
        width: 36,
        height: 36,
        borderRadius: 18
    },
    originText: {
        flex: 1,
        minWidth: 0
    },
    originDenseText: {
        flex: 1,
        minWidth: 0
    },
    originTitle: {
        fontWeight: '700'
    },
    originChangeButton: {
        flexShrink: 0
    },
    originChangeContent: {
        minHeight: 44,
        paddingHorizontal: 6
    },
    originChangeContentDense: {
        minHeight: 40,
        paddingHorizontal: 4
    },
    originExtras: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8
    },
    originExtrasWatch: {
        justifyContent: 'center',
        marginTop: 6
    },
    originWatchWrap: {
        width: '100%',
        alignItems: 'center'
    },
    originWatch: {
        width: '86%',
        minHeight: 52,
        paddingHorizontal: 16,
        paddingVertical: 6,
        alignItems: 'center',
        justifyContent: 'center'
    },
    originWatchRound: {
        width: '70%'
    },
    originWatchLabel: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '600',
        textAlign: 'center'
    },
    originWatchTitleRow: {
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
    },
    originWatchTitle: {
        flexShrink: 1,
        fontSize: 15,
        lineHeight: 19,
        fontWeight: '800',
        textAlign: 'center'
    },

    // Sections.
    section: {
        gap: 8
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 28
    },
    sectionTitleRowCompact: {
        minHeight: 24
    },
    sectionTitle: {
        fontWeight: '700'
    },
    shortQuickRow: {
        flexDirection: 'row',
        gap: 16
    },
    shortQuickColumn: {
        flex: 1,
        minWidth: 0
    },
    inlineEmpty: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 48,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: StyleSheet.hairlineWidth
    },
    inlineEmptyText: {
        flex: 1
    },
    quickTripList: {
        gap: 8,
        paddingRight: 8
    },
    favoriteChip: {
        width: 128,
        minHeight: 76,
        paddingHorizontal: 12,
        paddingVertical: 10,
        justifyContent: 'space-between',
        gap: 6
    },
    favoriteChipIcons: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    recentChip: {
        maxWidth: 220,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 14,
        paddingRight: 18,
        paddingVertical: 6
    },
    quickChipTitle: {
        fontWeight: '600'
    },
    recentChipTitle: {
        flexShrink: 1
    },
    searchBar: {
        flexShrink: 0
    },

    // Station list (M3 one-line list, 52 dp).
    stationGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: 0
    },
    stationRowWrap: {
        width: '100%'
    },
    stationRow: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center'
    },
    stationRowMain: {
        flex: 1,
        minWidth: 0,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingLeft: 16,
        paddingRight: 12
    },
    stationTitle: {
        flex: 1,
        minWidth: 0
    },
    stationStar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        marginRight: 2,
        alignItems: 'center',
        justifyContent: 'center'
    },
    stationDivider: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 54,
        marginRight: 16
    },

    // Tablet / desktop master-detail.
    tabletShell: {
        flex: 1,
        minHeight: 0,
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 16
    },
    tabletMasterPane: {
        flexShrink: 0,
        minHeight: 0,
        gap: 12
    },
    tabletDetailPane: {
        flex: 1,
        minWidth: 0,
        minHeight: 0
    },
    tabletMasterContent: {
        gap: 16,
        paddingBottom: 24
    },
    detailEmptyContent: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24
    },
    detailEmptyCard: {
        width: '100%',
        maxWidth: 560,
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 24,
        paddingVertical: 32
    },
    detailEmptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4
    },
    detailEmptyShortcuts: {
        width: '100%',
        gap: 8,
        marginTop: 8
    },
    detailEmptyShortcutList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8
    },

    // Watch.
    watchContent: {
        gap: 6,
        alignItems: 'stretch'
    },
    watchSectionLabel: {
        marginTop: 6,
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
        textAlign: 'center'
    },
    watchRow: {
        width: '94%',
        minHeight: 52,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden'
    },
    watchRowRound: {
        width: '84%'
    },
    watchRowMain: {
        flex: 1,
        minWidth: 0,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 14,
        paddingRight: 4,
        paddingVertical: 6
    },
    watchRowMainNoStar: {
        paddingRight: 14
    },
    watchRowMainCentered: {
        justifyContent: 'center'
    },
    watchRowTitle: {
        flex: 1,
        minWidth: 0,
        fontSize: 15,
        lineHeight: 19,
        fontWeight: '700'
    },
    watchRowTitleCentered: {
        flex: 0,
        flexShrink: 1,
        textAlign: 'center'
    },
    watchRowStar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 4,
        alignItems: 'center',
        justifyContent: 'center'
    },
    watchSettingsFooter: {
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 6
    },
    manualOriginHeaderWatch: {
        width: '76%',
        alignSelf: 'center',
        alignItems: 'center',
        gap: 4
    },
    manualOriginTitleWatch: {
        width: '100%',
        textAlign: 'center',
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '800',
        includeFontPadding: false
    },
    manualOriginReasonWatch: {
        width: '100%',
        textAlign: 'center',
        fontSize: 12,
        lineHeight: 15,
        fontWeight: '600',
        includeFontPadding: false
    }
});

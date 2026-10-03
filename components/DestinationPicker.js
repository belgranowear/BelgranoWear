import normalizeSpecialCharacters from 'specialtonormal';

import GestureRecognizer from 'react-native-swipe-gestures';

import React, { useEffect, useMemo, useState } from 'react';

import {
  BackHandler,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';

import * as Location from 'expo-location';

import { getPreciseDistance } from 'geolib';

import { MD5 } from 'crypto-js';

import {
  ActivityIndicator,
  Button,
  List,
  Surface,
  Text
} from 'react-native-paper';

import OfflineModeHint from './OfflineModeHint';
import { NextSchedulePane } from './NextSchedule';
import { AppScreen, StatusPill, TransitCard, WatchScaleItem, useResponsiveMetrics } from './ui';

import Cache       from '../includes/Cache';
import Lang        from '../includes/Lang';
import Preferences from '../includes/Preferences';
import { useTheme } from '../includes/Theme';
import { getUIPreviewMode, isWatchUIPreview, previewState } from '../includes/UIPreview';
import { fetchWithTimeout } from '../includes/Network';
import { nowInArgentina }   from '../includes/Time';

const PROXIMITY_WARNING_METERS = 1200;

const WATCH_FETCH_TIMEOUT_MS              = 6000;
const CACHE_VERIFICATION_CONCURRENCY      = 3;
const HOLIDAYS_CACHE_KEY_PATTERN          = /\/holidays_(\d{4})\.json$/;
const LAST_KNOWN_LOCATION_MAX_AGE_MS      = 5 * 60 * 1000;
const LAST_KNOWN_LOCATION_ACCURACY_METERS = 1000;

let cacheVerificationInProgress = false;

const formatDistanceKm = meters => (meters / 1000).toFixed(1);

const tripDestination = trip => trip.destination;

function SettingsButton({ navigation }) {
    const { theme } = useTheme();

    return (
        <Pressable
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel={Lang.t('settingsButtonLabel')}
            hitSlop={8}
            style={({ pressed }) => [
                styles.settingsButton,
                {
                    backgroundColor: theme.accentSoft,
                    opacity: pressed ? 0.72 : 1
                }
            ]}
        >
            <Text style={[ styles.settingsButtonIcon, { color: theme.accentStrong } ]}>⚙</Text>
        </Pressable>
    );
}

function StationRow({ item, onPress, onFavoritePress, isFavorite, accessibilityHint, compact = false, manualOrigin = false, selected = false }) {
    const { theme } = useTheme();

    if (compact) {
        return (
            <Surface
                mode="flat"
                elevation={0}
                style={[
                    styles.stationSurface,
                    styles.stationSurfaceWatch,
                    manualOrigin ? styles.stationSurfaceManualWatch : undefined,
                    { backgroundColor: theme.paperTheme.colors.surfaceVariant }
                ]}
            >
                <Pressable
                    onPress={onPress}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    accessibilityHint={accessibilityHint}
                    style={[ styles.stationRowPressableWatch, manualOrigin ? styles.stationRowPressableManualWatch : undefined ]}
                >
                    <Text
                        numberOfLines={manualOrigin ? 1 : 2}
                        adjustsFontSizeToFit={manualOrigin}
                        minimumFontScale={0.72}
                        style={[ styles.stationTitleWatch, manualOrigin ? styles.stationTitleManualWatch : undefined ]}
                    >
                        {item.title}
                    </Text>
                </Pressable>
                {onFavoritePress ? (
                    <Pressable
                        accessibilityLabel={isFavorite ? Lang.t('removeFavoriteBtnLabel') : Lang.t('addFavoriteBtnLabel')}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isFavorite }}
                        onPress={event => {
                            event?.stopPropagation?.();
                            onFavoritePress();
                        }}
                        hitSlop={8}
                        style={[
                            styles.stationStarFloating,
                            {
                                backgroundColor: isFavorite ? theme.accentSoft : 'rgba(255, 255, 255, 0.24)'
                            }
                        ]}
                    >
                        <Text style={[ styles.stationStarText, { color: isFavorite ? theme.accentStrong : theme.paperTheme.colors.onSurfaceVariant, opacity: isFavorite ? 1 : 0.72 } ]}>
                            {isFavorite ? '★' : '☆'}
                        </Text>
                    </Pressable>
                ) : null}
            </Surface>
        );
    }

    return (
        <Surface
            mode="flat"
            elevation={1}
            style={[
                styles.stationSurface,
                { backgroundColor: selected ? theme.accentSoft : theme.paperTheme.colors.surfaceVariant }
            ]}
        >
            <View style={styles.stationRow}>
                <Pressable
                    onPress={onPress}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    accessibilityHint={accessibilityHint}
                    style={({ pressed }) => [
                        styles.stationRowMain,
                        { opacity: pressed ? 0.72 : 1 }
                    ]}
                >
                    <Text style={[ styles.stationRowIcon, { color: theme.paperTheme.colors.onSurfaceVariant } ]}>🚆</Text>
                    <Text numberOfLines={2} style={styles.stationTitle}>{item.title}</Text>
                </Pressable>
                {onFavoritePress ? (
                    <Pressable
                        accessibilityLabel={isFavorite ? Lang.t('removeFavoriteBtnLabel') : Lang.t('addFavoriteBtnLabel')}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isFavorite }}
                        onPress={onFavoritePress}
                        hitSlop={8}
                        style={({ pressed }) => [
                            styles.stationRowSideAction,
                            { opacity: pressed ? 0.72 : 1 }
                        ]}
                    >
                        <Text style={[ styles.stationRowSideActionText, { color: isFavorite ? theme.accentStrong : theme.paperTheme.colors.onSurfaceVariant } ]}>
                            {isFavorite ? '★' : '☆'}
                        </Text>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={onPress}
                        accessibilityRole="button"
                        accessibilityLabel={item.title}
                        accessibilityHint={accessibilityHint}
                        hitSlop={8}
                        style={({ pressed }) => [
                            styles.stationRowSideAction,
                            { opacity: pressed ? 0.72 : 1 }
                        ]}
                    >
                        <Text style={[ styles.stationRowSideActionText, { color: theme.paperTheme.colors.onSurfaceVariant } ]}>›</Text>
                    </Pressable>
                )}
            </View>
        </Surface>
    );
}

function QuickRouteCard({ trip, label, onPress, compact = false }) {
    const { theme } = useTheme();

    if (compact) {
        return (
            <Surface mode="flat" elevation={0} style={[ styles.quickRouteCardWatch, { backgroundColor: theme.accentSoft } ]}>
                <Pressable
                    onPress={onPress}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}: ${trip.origin.title} ${Lang.t('to')} ${trip.destination.title}`}
                    style={styles.quickRoutePressableWatch}
                >
                    <Text numberOfLines={1} style={[ styles.quickRouteLabelWatch, { color: theme.accentStrong } ]}>{label}</Text>
                    <Text numberOfLines={2} style={[ styles.quickRouteTitleWatch, { color: theme.accentStrong } ]}>{tripDestination(trip).title}</Text>
                </Pressable>
            </Surface>
        );
    }

    return (
        <Surface mode="flat" elevation={1} style={[ styles.quickRouteCard, { backgroundColor: theme.paperTheme.colors.surfaceVariant } ]}>
            <List.Item
                title={tripDestination(trip).title}
                description={label}
                titleNumberOfLines={2}
                left={props => <List.Icon {...props} icon="ray-start-arrow" />}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${trip.origin.title} ${Lang.t('to')} ${trip.destination.title}`}
                style={styles.quickRouteItem}
            />
        </Surface>
    );
}

function LoadingState({ operation }) {
    const { theme } = useTheme();

    return (
        <AppScreen scroll={false} contentStyle={styles.centerContent}>
            <TransitCard style={styles.loadingCard}>
                <ActivityIndicator size="large" color={theme.accent} accessibilityLabel={operation} />
                <Text variant="titleMedium" style={styles.centerText}>{operation}</Text>
            </TransitCard>
        </AppScreen>
    );
}

export default function DestinationPicker({ navigation }) {
    const responsive = useResponsiveMetrics();
    const { theme, isAndroidDynamicColorAvailable } = useTheme();
    const previewMode = getUIPreviewMode();
    const watchLayout = responsive.isWatch || isWatchUIPreview();
    const tabletTwoPane = responsive.isTwoPane && !watchLayout;
    const watchListEndPadding = watchLayout ? Math.round(responsive.shortestSide * 0.2) : 0;

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

    const networkTimeoutMs = watchLayout ? WATCH_FETCH_TIMEOUT_MS : undefined;

    const destinationList = useMemo(() => {
        if (!allDestinationsList) { return []; }
        if (!originStation)       { return allDestinationsList; }

        return allDestinationsList.filter(item => item.id !== originStation.id);
    }, [ allDestinationsList, originStation ]);

    const currentOriginFavoriteDestinationIds = useMemo(() => {
        if (!originStation) { return []; }

        return favoriteTrips
            .filter(trip => trip.origin.id === originStation.id)
            .map(trip => trip.destination.id);
    }, [ favoriteTrips, originStation ]);

    const favoriteDestinations = useMemo(() => {
        if (!originStation) { return []; }

        return favoriteTrips
            .filter(trip => trip.origin.id === originStation.id)
            .map(trip => destinationList.find(item => item.id === trip.destination.id))
            .filter(Boolean);
    }, [ favoriteTrips, destinationList, originStation ]);

    const recentDestinations = useMemo(() => {
        if (!originStation) { return []; }

        return recentTrips
            .filter(trip => trip.origin.id === originStation.id)
            .map(trip => destinationList.find(item => item.id === trip.destination.id))
            .filter(Boolean)
            .filter((item, index, array) => array.findIndex(candidate => candidate.id === item.id) === index)
            .filter(item => currentOriginFavoriteDestinationIds.indexOf(item.id) === -1)
            .slice(0, 3);
    }, [ recentTrips, destinationList, originStation, currentOriginFavoriteDestinationIds ]);

    const prioritizedDestinations = useMemo(() => {
        const favoriteIds = currentOriginFavoriteDestinationIds;
        const favoriteIdsSet = new Set(favoriteIds);
        const favoriteItems = favoriteIds
            .map(id => destinationList.find(item => item.id === id))
            .filter(Boolean);
        const remainingItems = destinationList.filter(item => !favoriteIdsSet.has(item.id));

        return [ ...favoriteItems, ...remainingItems ];
    }, [ destinationList, currentOriginFavoriteDestinationIds ]);

    const crash = message => { setCrashMessage(message); };

    const refreshPreferences = async () => {
        setFavoriteTrips(await Preferences.getFavoriteTrips());
        setRecentTrips(await Preferences.getRecentTrips());
    };

    const swipeRightHandler = state => {
        if (!Platform.constants || Platform.constants.uiMode != 'watch') { return; }
        console.debug('swipeRightHandler:', state);
        BackHandler.exitApp();
    };

    const withOptionalSwipeExit = content => {
        if (watchLayout) { return content; }

        return (
            <GestureRecognizer style={{ flex: 1 }} onSwipeRight={swipeRightHandler} directionalOffsetThreshold={process.env.EXIT_SWIPE_X_MAX_OFFSET_THRESHOLD}>
                {content}
            </GestureRecognizer>
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

    const tryGetCurrentPositionAsync = timeout => new Promise(async (resolve, reject) => {
        timeout = parseInt(timeout);
        const timeoutHandle = setTimeout(() => reject(new Error(`Couldn't get GPS location after ${timeout / 1000} seconds.`)), timeout);

        try {
            const location = await Location.getCurrentPositionAsync();
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

        let location;

        try {
            location = await tryGetCurrentPositionAsync(process.env.GPS_FIX_TIMEOUT);
        } catch (exception) {
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
        setLoadFinished(true);
    };

    const goToDestination = async item => {
        setSelectedId(item.id);
        await Preferences.recordRecentTrip(originStation, item);
        await refreshPreferences();

        if (tabletTwoPane) {
            setTabletDestination(item);
            return;
        }

        navigation.navigate('NextSchedule', {
            origin:       originStation,
            destination:  item,
            segmentsList: segmentsList,
            holidaysList: holidaysList
        });
    };

    const toggleFavorite = async item => {
        await Preferences.toggleFavoriteTrip(originStation, item);
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

        const nextDestination = favoriteDestinations[0] || prioritizedDestinations[0];

        if (nextDestination) {
            setTabletDestination(nextDestination);
            setSelectedId(nextDestination.id);
        }
    }, [ tabletTwoPane, originStation, showManualOriginPicker, destinationList, favoriteDestinations, prioritizedDestinations, tabletDestination ]);

    const replaceTabletRoute = nextRoute => {
        setOriginStation(nextRoute.origin);
        setOriginDistanceMeters(undefined);
        setTabletDestination(nextRoute.destination);
        setSelectedId(nextRoute.destination.id);
        setShowManualOriginPicker(false);
    };

    const renderDestinationItem = ({ item }) => (
        <StationRow
            item={item}
            onPress={() => goToDestination(item)}
            accessibilityHint={Lang.t('selectThisDestinationHint').replace('%s', item.title)}
            onFavoritePress={() => toggleFavorite(item)}
            isFavorite={currentOriginFavoriteDestinationIds.indexOf(item.id) > -1}
            selected={item.id === selectedId}
            compact={watchLayout}
            manualOrigin={watchLayout && showManualOriginPicker}
        />
    );

    const renderOriginItem = ({ item }) => (
        <StationRow
            item={item}
            onPress={() => selectOrigin(item)}
            accessibilityHint={Lang.t('selectThisOriginHint').replace('%s', item.title)}
            compact={watchLayout}
            manualOrigin={watchLayout}
        />
    );

    const renderWatchStationStack = (items, renderItem, footer = null) => (
        <>
            {items.map((item, index) => (
                <WatchScaleItem key={item.id} style={index > 0 ? styles.watchScaledListItemSeparated : undefined}>
                    {renderItem({ item })}
                </WatchScaleItem>
            ))}
            {footer ? <WatchScaleItem style={styles.watchSettingsFooter}>{footer}</WatchScaleItem> : null}
            <View style={{ height: watchListEndPadding }} />
        </>
    );

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

    if (previewMode === 'loading' || (!loadFinished && !showManualOriginPicker)) {
        return <LoadingState operation={currentOperation} />;
    }

    if (showManualOriginPicker && !tabletTwoPane) {
        return withOptionalSwipeExit(
                <AppScreen contentStyle={[ styles.stackGap, watchLayout ? styles.manualOriginContentWatch : undefined ]}>
                    {watchLayout ? (
                        <View style={styles.manualOriginHeaderWatch}>
                            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.manualOriginTitleWatch}>
                                {Lang.t('chooseOriginHint')}
                            </Text>
                            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.manualOriginReasonWatch}>
                                {manualOriginReason || Lang.t('manualOriginFallbackMessage')}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.screenHeader}>
                            <View style={styles.headerTitleBlock}>
                                <Text variant="headlineSmall" style={styles.headerTitle}>{Lang.t('chooseOriginHint')}</Text>
                                <Text variant="bodyMedium">{manualOriginReason || Lang.t('manualOriginFallbackMessage')}</Text>
                            </View>
                            <SettingsButton navigation={navigation} />
                        </View>
                    )}
                    {watchLayout ? renderWatchStationStack(allDestinationsList || [], renderOriginItem, <SettingsButton navigation={navigation} />) : (
                        <FlatList
                            data={allDestinationsList || []}
                            renderItem={renderOriginItem}
                            keyExtractor={item => item.id}
                            scrollEnabled={false}
                            showsVerticalScrollIndicator={false}
                            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                        />
                    )}
                </AppScreen>
        );
    }

    const quickTrips = [
        ...favoriteDestinations.map(destination => ({ origin: originStation, destination, label: Lang.t('favoritesSectionTitle') })),
        ...recentDestinations.map(destination => ({ origin: originStation, destination, label: Lang.t('recentsSectionTitle') }))
    ];

    if (tabletTwoPane) {
        const isChoosingTabletOrigin = showManualOriginPicker || !originStation;
        const canShowTabletSchedule = originStation && tabletDestination && originStation.id !== tabletDestination.id;

        return withOptionalSwipeExit(
            <AppScreen scroll={false} contentWidth="wide" contentStyle={styles.tabletShell}>
                <View style={[ styles.tabletMasterPane, { width: responsive.tabletMasterWidth } ]}>
                    <View style={styles.tabletPaneHeader}>
                        <View style={styles.headerTitleBlock}>
                            <Text variant="headlineSmall" style={styles.headerTitle}>
                                {isChoosingTabletOrigin ? Lang.t('chooseOriginHint') : Lang.t('selectDestinationHint')}
                            </Text>
                            <Text variant="bodyMedium" numberOfLines={isChoosingTabletOrigin ? 3 : 2}>
                                {isChoosingTabletOrigin
                                    ? (manualOriginReason || Lang.t('manualOriginFallbackMessage'))
                                    : originStation?.title}
                            </Text>
                        </View>
                        <SettingsButton navigation={navigation} />
                    </View>

                    <ScrollView
                        style={styles.tabletMasterScroll}
                        contentContainerStyle={styles.tabletMasterContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {isChoosingTabletOrigin ? (
                            <FlatList
                                data={allDestinationsList || []}
                                renderItem={renderOriginItem}
                                keyExtractor={item => item.id}
                                scrollEnabled={false}
                                showsVerticalScrollIndicator={false}
                                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                            />
                        ) : (
                            <>
                                <TransitCard style={styles.routePanel}>
                                    <View style={styles.routePanelTop}>
                                        <View style={[ styles.routeIcon, { backgroundColor: theme.accent } ]}><Text variant="titleMedium" style={{ color: theme.textInverse }}>🚆</Text></View>
                                        <View style={styles.routePanelText}>
                                            <Text variant="labelMedium">{Lang.t('fromStationLabel')}</Text>
                                            <Text variant="titleLarge" style={styles.routeOrigin} numberOfLines={1}>{originStation?.title}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.routePanelActions}>
                                        <Button mode="outlined" icon="map-marker" onPress={() => setShowManualOriginPicker(true)}>{Lang.t('changeOriginBtnLabel')}</Button>
                                        <OfflineModeHint navigation={navigation} isOffline={networkErrorDetected} />
                                    </View>
                                    {originDistanceMeters > PROXIMITY_WARNING_METERS ? (
                                        <StatusPill icon="alert" tone="warning">{Lang.t('detectedOriginWarning').replace('%s', formatDistanceKm(originDistanceMeters))}</StatusPill>
                                    ) : null}
                                    {isAndroidDynamicColorAvailable ? <StatusPill icon="palette" tone="success">{Lang.t('materialYouEnabledLabel')}</StatusPill> : null}
                                </TransitCard>

                                {quickTrips.length > 0 ? (
                                    <View>
                                        <Text variant="titleMedium" style={styles.sectionTitle}>{Lang.t('favoritesSectionTitle')}</Text>
                                        <View style={styles.tabletQuickRouteList}>
                                            {quickTrips.map(trip => (
                                                <QuickRouteCard key={`${trip.label}-${trip.destination.id}`} trip={trip} label={trip.label} onPress={() => goToDestination(trip.destination)} />
                                            ))}
                                        </View>
                                    </View>
                                ) : null}

                                <View>
                                    <Text variant="titleMedium" style={styles.sectionTitle}>{Lang.t('allDestinationsSectionTitle')}</Text>
                                    <FlatList
                                        data={prioritizedDestinations}
                                        renderItem={renderDestinationItem}
                                        keyExtractor={item => item.id}
                                        extraData={`${selectedId}-${favoriteTrips.length}-${recentTrips.length}`}
                                        scrollEnabled={false}
                                        showsVerticalScrollIndicator={false}
                                        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                                    />
                                </View>
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
                            forcePreviewData={Boolean(previewMode)}
                        />
                    ) : (
                        <TransitCard style={styles.tabletEmptyDetail}>
                            <Text variant="headlineSmall" style={styles.centerText}>{Lang.t('selectDestinationHint')}</Text>
                            <Text variant="bodyMedium" style={styles.centerText}>{Lang.t('chooseOriginHint')}</Text>
                        </TransitCard>
                    )}
                </View>
            </AppScreen>
        );
    }

    return withOptionalSwipeExit(
            <AppScreen contentStyle={[ styles.stackGap, watchLayout ? styles.stackGapWatch : undefined ]}>
                {!watchLayout ? (
                    <View style={styles.screenHeader}>
                        <View style={styles.headerTitleBlock}>
                            <Text variant="headlineSmall" style={styles.headerTitle}>{Lang.t('selectDestinationHint')}</Text>
                            <Text variant="bodyMedium">{originStation?.title}</Text>
                        </View>
                        <SettingsButton navigation={navigation} />
                    </View>
                ) : null}

                {watchLayout ? <WatchScaleItem>
                    <TransitCard style={[ styles.routePanel, styles.routePanelWatch ]}>
                        <View style={[ styles.routePanelTop, styles.routePanelTopWatch ]}>
                            <View style={styles.routePanelText}>
                                <Text variant="labelSmall" style={styles.watchText}>{Lang.t('fromStationLabel')}</Text>
                                <Text variant="titleMedium" style={[ styles.routeOrigin, styles.watchText ]} numberOfLines={1}>{originStation?.title}</Text>
                            </View>
                        </View>
                        <View style={[ styles.routePanelActions, styles.routePanelActionsWatch ]}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={Lang.t('changeOriginBtnLabel')}
                                onPress={() => setShowManualOriginPicker(true)}
                                style={[ styles.changeOriginWatch, { borderColor: theme.paperTheme.colors.outline } ]}
                            >
                                <Text variant="labelLarge" style={styles.changeOriginTextWatch}>📍 {Lang.t('changeOriginBtnLabel')}</Text>
                            </Pressable>
                            <OfflineModeHint navigation={navigation} isOffline={networkErrorDetected} />
                        </View>
                        {originDistanceMeters > PROXIMITY_WARNING_METERS ? (
                            <StatusPill icon="alert" tone="warning">{Lang.t('detectedOriginWarning').replace('%s', formatDistanceKm(originDistanceMeters))}</StatusPill>
                        ) : null}
                        {isAndroidDynamicColorAvailable ? <StatusPill icon="palette" tone="success">{Lang.t('materialYouEnabledLabel')}</StatusPill> : null}
                    </TransitCard>
                </WatchScaleItem> : (
                    <TransitCard style={styles.routePanel}>
                        <View style={styles.routePanelTop}>
                            <View style={[ styles.routeIcon, { backgroundColor: theme.accent } ]}><Text variant="titleMedium" style={{ color: theme.textInverse }}>🚆</Text></View>
                            <View style={styles.routePanelText}>
                                <Text variant="labelMedium">{Lang.t('fromStationLabel')}</Text>
                                <Text variant="headlineSmall" style={styles.routeOrigin} numberOfLines={1}>{originStation?.title}</Text>
                            </View>
                        </View>
                        <View style={styles.routePanelActions}>
                            <Button mode="outlined" icon="map-marker" onPress={() => setShowManualOriginPicker(true)}>{Lang.t('changeOriginBtnLabel')}</Button>
                            <OfflineModeHint navigation={navigation} isOffline={networkErrorDetected} />
                        </View>
                        {originDistanceMeters > PROXIMITY_WARNING_METERS ? (
                            <StatusPill icon="alert" tone="warning">{Lang.t('detectedOriginWarning').replace('%s', formatDistanceKm(originDistanceMeters))}</StatusPill>
                        ) : null}
                        {isAndroidDynamicColorAvailable ? <StatusPill icon="palette" tone="success">{Lang.t('materialYouEnabledLabel')}</StatusPill> : null}
                    </TransitCard>
                )}

                {quickTrips.length > 0 ? (
                    watchLayout ? (
                        <WatchScaleItem>
                            <View style={styles.watchQuickRouteSection}>
                                <Text variant="labelLarge" style={[ styles.sectionTitle, styles.sectionTitleWatch ]}>{Lang.t('favoritesSectionTitle')}</Text>
                                {quickTrips.map(trip => (
                                    <QuickRouteCard key={`${trip.label}-${trip.destination.id}`} trip={trip} label={trip.label} onPress={() => goToDestination(trip.destination)} compact />
                                ))}
                            </View>
                        </WatchScaleItem>
                    ) : (
                        <View>
                            <Text variant="titleMedium" style={styles.sectionTitle}>{Lang.t('favoritesSectionTitle')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRouteList}>
                                {quickTrips.map(trip => (
                                    <QuickRouteCard key={`${trip.label}-${trip.destination.id}`} trip={trip} label={trip.label} onPress={() => goToDestination(trip.destination)} />
                                ))}
                            </ScrollView>
                        </View>
                    )
                ) : null}

                {watchLayout ? renderWatchStationStack(prioritizedDestinations, renderDestinationItem, <SettingsButton navigation={navigation} />) : (
                    <View>
                        <Text variant="titleMedium" style={styles.sectionTitle}>{Lang.t('allDestinationsSectionTitle')}</Text>
                        <FlatList
                            data={prioritizedDestinations}
                            renderItem={renderDestinationItem}
                            keyExtractor={item => item.id}
                            extraData={`${selectedId}-${favoriteTrips.length}-${recentTrips.length}`}
                            scrollEnabled={false}
                            showsVerticalScrollIndicator={false}
                            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                        />
                    </View>
                )}
            </AppScreen>
    );
}

const styles = StyleSheet.create({
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
        gap: 12
    },
    stackGapWatch: {
        gap: 4
    },
    tabletShell: {
        flex: 1,
        minHeight: 0,
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 16
    },
    tabletMasterPane: {
        flexShrink: 0,
        minHeight: 0
    },
    tabletDetailPane: {
        flex: 1,
        minWidth: 0,
        minHeight: 0
    },
    tabletPaneHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 12
    },
    tabletMasterScroll: {
        flex: 1,
        minHeight: 0
    },
    tabletMasterContent: {
        gap: 12,
        paddingBottom: 24
    },
    tabletQuickRouteList: {
        gap: 8
    },
    tabletEmptyDetail: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    manualOriginContentWatch: {
        gap: 6,
        paddingTop: 10,
        alignItems: 'center'
    },
    manualOriginHeaderWatch: {
        width: '76%',
        alignSelf: 'center',
        alignItems: 'center',
        gap: 4,
        marginBottom: 0
    },
    manualOriginTitleWatch: {
        width: '100%',
        textAlign: 'center',
        fontSize: 21,
        lineHeight: 24,
        fontWeight: '900',
        includeFontPadding: false
    },
    manualOriginReasonWatch: {
        width: '100%',
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 16,
        fontWeight: '600',
        opacity: 0.92,
        includeFontPadding: false
    },
    screenHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 2
    },
    settingsButton: {
        margin: 0,
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center'
    },
    settingsButtonIcon: {
        fontSize: 24,
        lineHeight: 28,
        fontWeight: '800'
    },
    watchScaledListItemSeparated: {
        marginTop: 6
    },
    watchSettingsFooter: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 6
    },
    headerTitleBlock: {
        flex: 1
    },
    headerTitleBlockWatch: {
        maxWidth: 240,
        alignSelf: 'center'
    },
    screenHeaderWatch: {
        justifyContent: 'center'
    },
    headerTitle: {
        fontWeight: '900'
    },
    watchText: {
        textAlign: 'center'
    },
    routePanel: {
        marginBottom: 4
    },
    routePanelWatch: {
        marginBottom: 0
    },
    routePanelTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14
    },
    routePanelTopWatch: {
        justifyContent: 'center',
        gap: 0
    },
    routeIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center'
    },
    routePanelText: {
        flex: 1
    },
    routeOrigin: {
        fontWeight: '900'
    },
    routePanelActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginTop: 4
    },
    routePanelActionsWatch: {
        justifyContent: 'center',
        marginTop: 2
    },
    changeOriginWatch: {
        height: 32,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center'
    },
    changeOriginTextWatch: {
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '800'
    },
    sectionTitle: {
        marginBottom: 8,
        fontWeight: '800'
    },
    sectionTitleWatch: {
        marginBottom: 6,
        textAlign: 'center'
    },
    quickRouteList: {
        gap: 10,
        paddingRight: 8,
        paddingBottom: 4
    },
    quickRouteCard: {
        width: 220,
        borderRadius: 22,
        overflow: 'hidden'
    },
    quickRouteItem: {
        minHeight: 86
    },
    watchQuickRouteSection: {
        width: '92%',
        alignSelf: 'center',
        gap: 6
    },
    quickRouteCardWatch: {
        borderRadius: 20,
        overflow: 'hidden'
    },
    quickRoutePressableWatch: {
        minHeight: 46,
        paddingHorizontal: 14,
        paddingVertical: 7,
        justifyContent: 'center'
    },
    quickRouteLabelWatch: {
        fontSize: 11,
        lineHeight: 13,
        fontWeight: '700',
        opacity: 0.72,
        textAlign: 'center'
    },
    quickRouteTitleWatch: {
        fontSize: 15,
        lineHeight: 18,
        fontWeight: '900',
        textAlign: 'center'
    },
    stationSurface: {
        borderRadius: 18,
        overflow: 'hidden'
    },
    stationSurfaceWatch: {
        width: '92%',
        alignSelf: 'center',
        borderRadius: 24,
        minHeight: 52,
        position: 'relative'
    },
    stationSurfaceManualWatch: {
        width: '82%',
        borderRadius: 21,
        minHeight: 44
    },
    stationRowPressableWatch: {
        minHeight: 52,
        paddingLeft: 16,
        paddingRight: 52,
        justifyContent: 'center'
    },
    stationRowPressableManualWatch: {
        minHeight: 44,
        paddingLeft: 18,
        paddingRight: 18,
        alignItems: 'center'
    },
    stationRow: {
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'stretch'
    },
    stationRowMain: {
        flex: 1,
        minWidth: 0,
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingLeft: 18,
        paddingRight: 8,
        paddingVertical: 8
    },
    stationRowIcon: {
        width: 24,
        textAlign: 'center',
        fontSize: 19,
        lineHeight: 23
    },
    stationRowSideAction: {
        width: 56,
        minHeight: 60,
        alignItems: 'center',
        justifyContent: 'center'
    },
    stationRowSideActionText: {
        textAlign: 'center',
        fontSize: 29,
        lineHeight: 33,
        fontWeight: '700'
    },
    stationRowWatch: {
        minHeight: 52,
        paddingVertical: 0,
        paddingLeft: 12,
        paddingRight: 42
    },
    stationTitle: {
        fontWeight: '700'
    },
    stationTitleWatch: {
        fontSize: 16,
        lineHeight: 20,
        fontWeight: '800',
        textAlign: 'left'
    },
    stationTitleManualWatch: {
        width: '100%',
        textAlign: 'center',
        fontSize: 16,
        lineHeight: 20
    },
    stationStarFloating: {
        position: 'absolute',
        top: 3,
        right: 5,
        margin: 0,
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center'
    },
    stationStarText: {
        fontSize: 30,
        lineHeight: 34,
        fontWeight: '700'
    }
});

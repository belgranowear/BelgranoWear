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
  IconButton,
  List,
  Surface,
  Text
} from 'react-native-paper';

import OfflineModeHint from './OfflineModeHint';
import { AppScreen, StatusPill, TransitCard, WatchScaleItem, useResponsiveMetrics } from './ui';

import Cache       from '../includes/Cache';
import Lang        from '../includes/Lang';
import Preferences from '../includes/Preferences';
import { useTheme } from '../includes/Theme';
import { getUIPreviewMode, isWatchUIPreview, previewState } from '../includes/UIPreview';

const PROXIMITY_WARNING_METERS = 1200;

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

function StationRow({ item, onPress, onFavoritePress, isFavorite, accessibilityHint, compact = false, manualOrigin = false }) {
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
                { backgroundColor: theme.paperTheme.colors.surfaceVariant }
            ]}
        >
            <List.Item
                title={item.title}
                titleNumberOfLines={2}
                titleStyle={styles.stationTitle}
                left={props => <List.Icon {...props} icon="train" />}
                right={props => onFavoritePress
                    ? <IconButton
                        {...props}
                        icon={isFavorite ? 'star' : 'star-outline'}
                        accessibilityLabel={isFavorite ? Lang.t('removeFavoriteBtnLabel') : Lang.t('addFavoriteBtnLabel')}
                        onPress={onFavoritePress}
                      />
                    : <List.Icon {...props} icon="chevron-right" />}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                accessibilityHint={accessibilityHint}
                style={styles.stationRow}
            />
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

    const verifyCachedResources = async () => {
        setCurrentOperation( Lang.t('verifyCachedResourcesMessage') + '…' );

        let cacheKeys     = await Cache.keys(),
            unmatchedKeys = 0;

        try {
            while (cacheKeys.length > 0) {
                let url = cacheKeys[ Object.keys(cacheKeys)[0] ];

                if (url.indexOf('http') !== 0) {
                    cacheKeys.shift();
                    continue;
                }

                let remoteChecksumURL = (
                    process.env.REMOTE_BASE_URL + '/' +
                    (new URL(url)).pathname
                        .replace(new RegExp('^\/'),    '')
                        .replace(new RegExp('.json$'), '') + '_sum'
                ),  remoteChecksum = await (await fetch(remoteChecksumURL)).text();

                let file     = await Cache.get(url),
                    checksum = MD5( JSON.stringify(file) ).toString();

                if (checksum !== remoteChecksum) {
                    try {
                        let prefetchResponse = await fetch(url),
                            prefetchJSON     = await prefetchResponse.json();

                        Cache.set(url, prefetchJSON);
                    } catch (prefetchException) {
                        console.warn(`verifyCachedResources: prefetch failed for "${url}":`, prefetchException);
                    }

                    unmatchedKeys++;

                    if (unmatchedKeys >= process.env.CACHE_MAX_UNMATCHED_KEYS_FOR_CLEAR) {
                        await Cache.clear();
                        return;
                    }
                }

                cacheKeys.shift();
            }
        } catch (exception) {
            console.warn('verifyCachedResources: couldn\'t query:', exception);
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
                name:      station.tags.name.replace(/ \(.*'/, ''),
                shortName: station.tags.short_name,
                latitude:  (station.lat ?? station.center.lat),
                longitude: (station.lon ?? station.center.lon)
            });
        });

        setTrainStationsMap(newTrainStationsMap);
    };

    const fetchJSONWithCache = async ({ url, onLoad, errorMessage, operationMessage }) => {
        setCurrentOperation( operationMessage + '…' );

        try {
            const response = await fetch(url);
            const json     = await response.json();

            onLoad(json);
            Cache.set(url, json);
        } catch (exception) {
            let cachedData = await Cache.get(url);

            if (cachedData) {
                setNetworkErrorDetected(true);
                onLoad(cachedData);
            } else {
                console.error(`fetchJSONWithCache: couldn't query ${url}:`, exception);
                crash(errorMessage);
            }
        }
    };

    const fetchTrainStationsMap = async () => await fetchJSONWithCache({
        url:              process.env.REMOTE_BASE_URL + '/train_stations.json',
        onLoad:           loadTrainStationsMap,
        errorMessage:     Lang.t('fetchTrainStationsMapError'),
        operationMessage: Lang.t('fetchingTrainStationsMapMessage')
    });

    const fetchHolidaysList = async () => await fetchJSONWithCache({
        url:              process.env.REMOTE_BASE_URL + `/holidays_${(new Date().getFullYear())}.json`,
        onLoad:           setHolidaysList,
        errorMessage:     Lang.t('fetchHolidaysListError'),
        operationMessage: Lang.t('fetchingHolidaysListMessage')
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
            const location = await Location.getLastKnownPositionAsync({ accuracy: Location.Accuracy.Low });
            clearTimeout(timeoutHandle);
            resolve(location);
        } catch (exception) {
            clearTimeout(timeoutHandle);
            reject(exception);
        }
    });

    const areLocationPermissionsGranted = async () => {
        if (Platform.OS === 'android' && Platform.Version < 23) { return true; }

        let { status } = await Location.requestForegroundPermissionsAsync();

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
        setShowManualOriginPicker(false);
        setLoadFinished(true);
    };

    const goToDestination = async item => {
        setSelectedId(item.id);
        await Preferences.recordRecentTrip(originStation, item);
        await refreshPreferences();

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
        await refreshPreferences();
        await verifyCachedResources();
        await Promise.all([ fetchTrainStationsMap(), fetchHolidaysList(), fetchAvailabilityOptions() ]);
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
        detectOriginStation();
    }, [ trainStationsMap, allDestinationsList, showManualOriginPicker ]);

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

    if (showManualOriginPicker) {
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
        minHeight: 58,
        paddingVertical: 4
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

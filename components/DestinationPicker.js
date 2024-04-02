import GestureRecognizer from 'react-native-swipe-gestures';

import { StatusBar } from 'expo-status-bar';

import React, { useEffect, useState } from 'react';

import {
  BackHandler,
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  FlatList,
  StyleSheet,
  Platform,
  Text,
  View,
  TouchableOpacity
} from 'react-native';

import * as Location from 'expo-location';

import { getPreciseDistance } from 'geolib';

import { MD5 } from 'crypto-js';

import OfflineModeHint from './OfflineModeHint';

import Cache           from '../includes/Cache';
import Lang            from '../includes/Lang';

const Item = ({item, onPress, backgroundColor, textColor, hasLargeDisplay}) => (
    <TouchableOpacity
        onPress={onPress}
        style={[
            (
                hasLargeDisplay
                    ? styles.itemLarge
                    : styles.item
            ),
            {backgroundColor}
        ]}
    >
      <Text style={[styles.title, {color: textColor}]}>{item.title}</Text>
    </TouchableOpacity>
);

export default function DestinationPicker({ navigation }) {
    const [ hasLargeDisplay,      setHasLargeDisplay      ] = useState();
    const [ originStation,        setOriginStation        ] = useState();
    const [ trainStationsMap,     setTrainStationsMap     ] = useState();
    const [ currentOperation,     setCurrentOperation     ] = useState();
    const [ holidaysList,         setHolidaysList         ] = useState();
    const [ loadFinished,         setLoadFinished         ] = useState();
    const [ destinationsList,     setDestinationsList     ] = useState();
    const [ segmentsList,         setSegmentsList         ] = useState();
    const [ crashMessage,         setCrashMessage         ] = useState();
    const [ networkErrorDetected, setNetworkErrorDetected ] = useState();
    const [ selectedId,           setSelectedId           ] = useState();

    const crash = message => { setCrashMessage(message); };

    const swipeRightHandler = state => {
        if (Platform.constants.uiMode != 'watch') {
            console.debug(`swipeRightHandler: aborted, uiMode should be "watch" but its current value is "${Platform.constants.uiMode}".`);

            return;
        }

        console.debug('swipeRightHandler:', state);

        BackHandler.exitApp();
    }

    const verifyCachedResources = async () => {
        setCurrentOperation( Lang.t('verifyCachedResourcesMessage') + '…' );

        let cacheKeys     = await Cache.keys(),
            unmatchedKeys = 0;

        console.debug('Cache keys:', cacheKeys);

        try {
            while (cacheKeys.length > 0) {
                let url = cacheKeys[ Object.keys(cacheKeys)[0] ];

                let remoteChecksumURL = (
                    process.env.REMOTE_BASE_URL + '/' +
                    (new URL(url)).pathname
                        .replace(new RegExp('^\/'),    '')
                        .replace(new RegExp('.json$'), '') + '_sum'
                ),  remoteChecksum = await (await fetch(remoteChecksumURL)).text();

                let file     = await Cache.get(url),
                    checksum = MD5( JSON.stringify(file) ).toString();

                console.debug('verifyCachedResources: remoteChecksumURL:', remoteChecksumURL, remoteChecksum);

                if (checksum !== remoteChecksum) {
                    console.info(`verifyCachedResources: new version detected for "${url}", redownloading... - ${checksum} !== ${remoteChecksum} - ${JSON.stringify(file)}`);

                    try {
                        let prefetchResponse = await fetch(url),
                            prefetchJSON     = await prefetchResponse.json();

                        console.debug(`verifyCachedResources: prefetch succeeded for "${url}"! - ${JSON.stringify(prefetchJSON)}`);

                        Cache.set(url, prefetchJSON);
                    } catch (prefetchException) {
                        console.warn(`verifyCachedResources: prefetch failed for "${url}":`, prefetchException);
                    }

                    unmatchedKeys++;

                    if (unmatchedKeys >= process.env.CACHE_MAX_UNMATCHED_KEYS_FOR_CLEAR) {
                        console.debug(`verifyCachedResources: more than ${process.env.CACHE_MAX_UNMATCHED_KEYS_FOR_CLEAR} cache keys didn't match with the remote server, clearing everything and starting over!`);

                        await Cache.clear();

                        return;
                    }
                } else {
                    console.debug(`verifyCachedResources: the remote checksum for "${url}" matches with out local version! - ${checksum} === ${remoteChecksum} - ${JSON.stringify(file)}`);
                }

                cacheKeys.shift();
            }
        } catch (exception) {
            console.warn('verifyCachedResources: couldn\'t query:', exception);
        }
    }

    const loadTrainStationsMap = json => {
        let newTrainStationsMap = [];

        json.elements.forEach(station => {
            if (typeof(station.tags.name) == 'undefined') {
                console.warn('UTN:', station);

                return;
            }

            if (
                (
                    typeof(station.lat) == 'undefined'
                    ||
                    typeof(station.lon) == 'undefined'
                )
                &&
                typeof(station.center) == 'undefined'
            ) {
                console.warn('NLD:', station);

                return;
            }

            newTrainStationsMap.push({
                name:      station.tags.name.replace(/ \(.*'/, ''), // remove additional info hints
                shortName: station.tags.short_name,
                latitude:  (station.lat ?? station.center.lat),
                longitude: (station.lon ?? station.center.lon)
            });
        });

        setTrainStationsMap(newTrainStationsMap);

        console.debug('newTrainStationsMap:', newTrainStationsMap);
    };

    const fetchTrainStationsMap = async () => {
        setCurrentOperation( Lang.t('fetchingTrainStationsMapMessage') + '…' );

        let url = process.env.REMOTE_BASE_URL + '/train_stations.json';

        await fetch(url)
          .then(response => response.json())
          .then(json     => {
            console.debug('fetchTrainStationsMap:', json);

            loadTrainStationsMap(json);

            Cache.set(url, json);
          })
          .catch(async exception => {
            let cachedData = await Cache.get(url);

            if (cachedData) {
                console.warn('fetchTrainStationsMap: couldn\'t query, falling back to cached response. - ', exception);

                setNetworkErrorDetected(true);

                loadTrainStationsMap(cachedData);
            } else {
                console.error('fetchTrainStationsMap: couldn\'t query:', exception);

                crash( Lang.t('fetchTrainStationsMapError') );
            }
          });
    }

    const fetchHolidaysList = async () => {
        setCurrentOperation( Lang.t('fetchingHolidaysListMessage') + '…' );

        let url = process.env.REMOTE_BASE_URL + `/holidays_${(new Date().getFullYear())}.json`;

        await fetch(url)
          .then(response => response.json())
          .then(json     => {
            console.debug('fetchHolidaysList:', json);

            setHolidaysList(json);

            Cache.set(url, json);
          })
          .catch(async exception => {
            let cachedData = await Cache.get(url);

            if (cachedData) {
                console.warn('fetchHolidaysList: couldn\'t query, falling back to cached response. - ', exception);

                setNetworkErrorDetected(true);

                setHolidaysList(cachedData);
            } else {
                console.error('fetchHolidaysList: couldn\'t query:', exception);

                crash( Lang.t('fetchHolidaysListError') );
            }
          });
    }

    const loadAvailabilityOptions = json => {
        let newDestinationsList = [];

        Object.keys(json.destination).forEach(key => {
            newDestinationsList.push({
                id:    key,
                title: json.destination[key]
            });
        });

        console.debug('newDestinationsList:', newDestinationsList);

        setSegmentsList(json.scheduleSegment);
        setDestinationsList(newDestinationsList);
    }

    const fetchAvailabilityOptions = async () => {
        setCurrentOperation( Lang.t('fetchingAvailabilityOptionsMessage') + '…' );

        let url = process.env.REMOTE_BASE_URL + '/availability_options.json';

        await fetch(url)
            .then(response => response.json())
            .then(json     => {
                console.debug('fetchAvailabilityOptions:', json);

                loadAvailabilityOptions(json);

                Cache.set(url, json);
            })
            .catch(async exception => {
                console.warn(exception);

                let cachedData = await Cache.get(url);

                if (cachedData) {
                    console.warn('fetchAvailabilityOptions: couldn\'t query, falling back to cached response. - ', exception);
    
                    setNetworkErrorDetected(true);
    
                    loadAvailabilityOptions(cachedData);
                } else {
                    console.error('fetchAvailabilityOptions: couldn\'t query:', exception);

                    crash( Lang.t('fetchAvailabilityOptionsError') );
                }
            });
    };

    const tryGetCurrentPositionAsync = timeout => {
        timeout = parseInt(timeout);

        console.debug(`tryGetCurrentPositionAsync: timeout = ${timeout}`);

        return new Promise(async (resolve, reject) => {
            setTimeout(() => {
                reject(
                    new Error(`Couldn\'t get GPS location after ${timeout / 1000} seconds.`)
                )
            }, timeout);

            resolve(await Location.getCurrentPositionAsync());
        });
    };

    const tryGetLastKnownPositionAsync = timeout => {
        timeout = parseInt(timeout);

        console.debug(`tryGetLastKnownPositionAsync: timeout = ${timeout}`);

        return new Promise(async (resolve, reject) => {
            setTimeout(() => {
                reject(
                    new Error(`Couldn\'t get GPS location after ${timeout / 1000} seconds.`)
                )
            }, timeout);

            resolve(
                await Location.getLastKnownPositionAsync({
                    accuracy: Location.Accuracy.Low
                })
            );
        });
    };

    const areLocationPermissionsGranted = async () => {
        if (Platform.OS === 'android') {
            console.debug('requestForegroundPermissionsAsync: Platform.Version:', Platform.Version);

            if (Platform.Version < 23) { // Marshmallow
                console.debug(`requestForegroundPermissionsAsync: the Android SDK version is lower than 23 (version ${Platform.Version} detected), skipping location permission request...`);

                return true;
            }
        }

        let { status } = await Location.requestForegroundPermissionsAsync();

        console.debug('requestForegroundPermissionsAsync:', status);

        if (status !== 'granted') {
          crash( Lang.t('locationAccessDeniedMessage') );

          return false;
        }

        return true;
    };

    const detectOriginStation = async () => {
        setCurrentOperation( Lang.t('detectingOriginStationMessage') + '…' );

        if (!areLocationPermissionsGranted()) { return; }

        let location;
  
        try {
            location = await tryGetCurrentPositionAsync(process.env.GPS_FIX_TIMEOUT);

            console.debug('tryGetCurrentPositionAsync: location:', location);
        } catch (exception) {
            console.warn('getCurrentPositionAsync() failed, retrying with getLastKnownPositionAsync()... - ', exception);

            try {
                location = await tryGetLastKnownPositionAsync(process.env.GPS_FIX_TIMEOUT);

                console.debug('tryGetLastKnownPositionAsync: location:', location);
            } catch (exception) {
                console.error('detectOriginStation:', exception);

                switch (exception.code) {
                    case 'ERR_LOCATION_SETTINGS_UNSATISFIED':
                        crash( Lang.t('locationAccessDeniedMessage') );

                        break;
                    default:
                        crash( Lang.t('locationUnknownErrorMessage') );
                }

                return;
            }
        }

        if (!location) {
            crash( Lang.t('locationUnknownErrorMessage') );

            return;
        }

        let closestDistanceMeters = null,
            closestOriginNames    = null;

        for (let index = 0; index < trainStationsMap.length; index++) {
            let station         = trainStationsMap[index],
                currentDistance = getPreciseDistance(station, location.coords);

            // console.debug('currentDistance:', currentDistance);

            if (
                closestDistanceMeters === null
                ||
                currentDistance < closestDistanceMeters
            ) {
                closestOriginNames     = [ station.name ];
                closestDistanceMeters  = currentDistance;

                if (typeof(station.shortName) != 'undefined') {
                    closestOriginNames.push(station.shortName);
                }
            }
        }

        console.debug('closestOriginNames:',    closestOriginNames);
        console.debug('closestDistanceMeters:', closestDistanceMeters);

        if (closestOriginNames === null)  {
            crash( Lang.t('originDetectionErrorMessage') );

            return;
        }

        destinationsList.forEach(destination => {
            if (destination.id === null) { return; } // skip dummy

            closestOriginNames.forEach(name => {
                // console.debug(destination, ' / ', name);

                if (destination.title.toLowerCase().indexOf(name.toLowerCase()) > -1) {
                    console.debug('detectOriginStation:', destination, '==', name);

                    setOriginStation(destination);

                    setLoadFinished(true);
                }
            });
        });
    };

    const renderItem = ({ item }) => {
      const backgroundColor = item.id === selectedId ? '#7f3026' : '#be4936';
      const color           = 'white';

      return (
        <Item
          item={item}
          onPress={() => {
            console.debug(item);

            setSelectedId(item.id);

            navigation.navigate('NextSchedule', {
                origin:         originStation,
                destination:    item,
                segmentsList:   segmentsList,
                holidaysList:   holidaysList
            });
          }}
          backgroundColor={backgroundColor}
          textColor={color}
          hasLargeDisplay={hasLargeDisplay}
        />
      );
    };

    // Runs once during the startup
    useEffect(() => {
        setHasLargeDisplay(
            Dimensions.get('window').width >= process.env.SCREEN_SMALL_WIDTH_PX
        );

        Dimensions.addEventListener('change', ({window}) => {
            console.log('window:', window);

            setHasLargeDisplay(
                window.width >= process.env.SCREEN_SMALL_WIDTH_PX
            );
        });

        const fetchData = async () => {
            await verifyCachedResources();
            await fetchTrainStationsMap();
            await fetchHolidaysList();
            await fetchAvailabilityOptions();
        };

        fetchData();
    }, []);

    // Runs when the origin station is available
    useEffect(() => {
        if (typeof(originStation) == 'undefined') { return; }

        // Remove the origin station
        setDestinationsList(
            destinationsList.filter(item => (item.id != originStation.id))
        );
    }, [ originStation ]);

    // Runs when the train stations map gets populated
    useEffect(() => {
        if (
            typeof(trainStationsMap) == 'undefined'
            ||
            typeof(destinationsList) == 'undefined'
        ) { return; }

        detectOriginStation();
    }, [ trainStationsMap, destinationsList ]);

    if (typeof(crashMessage) != 'undefined') {
        console.error(crashMessage);

        return (
            <GestureRecognizer style={{ flex: 1 }} onSwipeRight={swipeRightHandler} directionalOffsetThreshold={process.env.EXIT_SWIPE_X_MAX_OFFSET_THRESHOLD}>
                <SafeAreaView style={styles.list}>
                    <Text style={styles.title}>
                        {crashMessage}
                    </Text>
                </SafeAreaView>
            </GestureRecognizer>
        );
    }

    return (
        <GestureRecognizer style={{ flex: 1 }} onSwipeRight={swipeRightHandler} directionalOffsetThreshold={process.env.EXIT_SWIPE_X_MAX_OFFSET_THRESHOLD}>
            <SafeAreaView style={styles.list}>
                <OfflineModeHint navigation={navigation} isOffline={networkErrorDetected} />

                {
                    loadFinished
                        ? <View style={{ width: '100%' }}>
                            <Text style={{
                                    color: 'white',
                                    paddingTop: 20,
                                    paddingBottom: 8,
                                    textAlign: 'center',
                                    fontSize: 16
                                }}>
                                    { Lang.t('selectDestinationHint') }
                            </Text>
                            {
                                <FlatList
                                    key={hasLargeDisplay}
                                    data={destinationsList}
                                    renderItem={renderItem}
                                    keyExtractor={item => item.id}
                                    extraData={selectedId}
                                    numColumns={
                                        hasLargeDisplay
                                            ? 2
                                            : 1
                                    }
                                    columnWrapperStyle={
                                        hasLargeDisplay
                                            ? { gap: 6 }
                                            : undefined
                                    }
                                />
                            }
                          </View>
                        : <View>
                            <ActivityIndicator size="12" color="#be4936" />
                            <Text style={{
                                color: 'white',
                                textAlign: 'center'
                            }}>
                                {currentOperation}
                            </Text>
                        </View>
                }
            </SafeAreaView>
        </GestureRecognizer>
    );
}

const styles = StyleSheet.create({
    listItem: { textAlign: 'center' },
    list: {
      display: 'flex',
      flexDirection: 'row',
      width: '100%',
      flex: 1,
      backgroundColor: '#000',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginTop: (StatusBar.currentHeight || 0),
      marginVertical: 0,
      paddingVertical: 0
    },
    itemLarge: {
      width: '50%',
      paddingVertical: 8,
      marginBottom: 6
    },
    item: {
      width: '100%',
      paddingVertical: 8,
      marginBottom: 6
    },
    title: {
        color: 'white',
        textAlign: 'center',
        fontSize: 16
    },
});


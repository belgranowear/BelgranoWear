import GestureRecognizer from 'react-native-swipe-gestures';

import { StatusBar } from 'expo-status-bar';

import React, { useEffect, useState } from 'react';

import {
  BackHandler,
  ActivityIndicator,
  SafeAreaView,
  FlatList,
  StyleSheet,
  Text,
  View,
  TouchableOpacity
} from 'react-native';

import * as Location from 'expo-location';

import { getPreciseDistance } from 'geolib';

import Lang            from './Lang';
import Cache           from './Cache';
import OfflineModeHint from './OfflineModeHint';

const Item = ({item, onPress, backgroundColor, textColor}) => (
    <TouchableOpacity onPress={onPress} style={[styles.item, {backgroundColor}]}>
      <Text style={[styles.title, {color: textColor}]}>{item.title}</Text>
    </TouchableOpacity>
);

export default function DestinationPicker({ navigation }) {
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
        console.debug('swipeRightHandler:', state);

        BackHandler.exitApp();
    }

    const fetchTrainStationsMap = async () => {
        setCurrentOperation(
            Lang.t('fetchingTrainStationsMapMessage') + '…'
        );

        let url = process.env.REMOTE_BASE_URL + '/train_stations.json';

        await fetch(url)
          .then(response => response.json())
          .then(json     => {
            console.debug('fetchTrainStationsMap:', json);

            let newTrainStationsMap = [];

            json.elements.forEach(station => {
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

            Cache.set(url, newTrainStationsMap);
          })
          .catch(async exception => {
            let cachedData = await Cache.get(url);

            if (cachedData) {
                console.warn('fetchTrainStationsMap: couldn\'t query, falling back to cached response.');

                setNetworkErrorDetected(true);

                setTrainStationsMap(cachedData);
            } else {
                console.error('fetchTrainStationsMap: couldn\'t query:', exception);

                crash( Lang.t('fetchTrainStationsMapError') );
            }
          });
    }

    const fetchHolidaysList = async () => {
        setCurrentOperation(
            Lang.t('fetchingHolidaysListMessage') + '…'
        );

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
                console.warn('fetchHolidaysList: couldn\'t query, falling back to cached response.');

                setNetworkErrorDetected(true);

                setHolidaysList(cachedData);
            } else {
                console.error('fetchHolidaysList: couldn\'t query:', exception);

                crash( Lang.t('fetchHolidaysListError') );
            }
          });
    }

    const fetchAvailabilityOptions = async () => {
        setCurrentOperation(
            Lang.t('fetchingAvailabilityOptionsMessage') + '…'
        );

        let url = process.env.REMOTE_BASE_URL + '/availability_options.json';

        await fetch(url)
            .then(response => response.json())
            .then(json     => {
                console.debug('fetchAvailabilityOptions:', json);

                // First null element resolves to a UI user action hint
                let newDestinationsList = [{ id: null }];

                Object.keys(json.destination).forEach(key => {
                    newDestinationsList.push({
                        id:    key,
                        title: json.destination[key]
                    });
                });

                setSegmentsList(json.scheduleSegment);
                setDestinationsList(newDestinationsList);

                Cache.set(url, newDestinationsList);
            })
            .catch(async exception => {
                console.warn(exception);

                let cachedData = await Cache.get(url);

                if (cachedData) {
                    console.warn('fetchAvailabilityOptions: couldn\'t query, falling back to cached response.');
    
                    setNetworkErrorDetected(true);
    
                    setHolidaysList(cachedData);
                } else {
                    console.error('fetchAvailabilityOptions: couldn\'t query:', exception);

                    crash( Lang.t('fetchAvailabilityOptionsError') );
                }
            });
    };

    const detectOriginStation = async () => {
        setCurrentOperation(
            Lang.t('detectingOriginStationMessage') + '…'
        );

        let { status } = await Location.requestForegroundPermissionsAsync();

        console.debug('requestForegroundPermissionsAsync:', status);

        if (status !== 'granted') {
          crash( Lang.t('locationAccessDeniedMessage') );

          return;
        }

        let location;
  
        try {
            location = await Location.getCurrentPositionAsync();

            console.debug('location:', location);
        } catch (exception) {
            console.warn('getCurrentPositionAsync() failed, retrying with getLastKnownPositionAsync()... - ', exception);

            try {
                location = await Location.getLastKnownPositionAsync({
                    accuracy: Location.Accuracy.Low
                });

                console.debug('location:', location);
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

      if (item.id === null) {
        return (
            <Text style={{
                color: 'white',
                paddingTop: 20,
                paddingBottom: 8,
                textAlign: 'center',
                fontSize: 16
            }}>
                { Lang.t('selectDestinationHint') }
            </Text>
        );
      }

      if (item.id == originStation.id) { return; }

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
        />
      );
    };

    // Runs once during the startup
    useEffect(() => {
        const fetchData = async () => {
            await fetchTrainStationsMap();
            await fetchHolidaysList();
            await fetchAvailabilityOptions();
        };

        fetchData();
    }, []);

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
                        ? <FlatList
                            data={destinationsList}
                            renderItem={renderItem}
                            keyExtractor={item => item.id}
                            extraData={selectedId}
                        />
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
      alignSelf: 'center',
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


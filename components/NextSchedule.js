import normalizeSpecialCharacters from 'specialtonormal';

import React, { useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  AppState,
  SafeAreaView,
  StyleSheet,
  Platform,
  Text,
  View,
  Vibration,
  Animated,
  Dimensions
} from 'react-native';

import IDomParser from 'advanced-html-parser';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import dayjs    from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

import Cache    from '../includes/Cache';
import Lang     from '../includes/Lang';

import OfflineModeHint from './OfflineModeHint';

export default function NextSchedule({ navigation, route }) {
    const [ crashMessage,            setCrashMessage            ] = useState();
    const [ remainingTimeMillis,     setRemainingTimeMillis     ] = useState();
    const [ remainingTimeMessage,    setRemainingTimeMessage    ] = useState();
    const [ nextTripTime,            setNextTripTime            ] = useState();
    const [ alternativeNextTripTime, setAlternativeNextTripTime ] = useState();
    const [ shouldTryNextDay,        setShouldTryNextDay        ] = useState();
    const [ networkErrorDetected,    setNetworkErrorDetected    ] = useState();
    const [ currentOperation,        setCurrentOperation        ] = useState();
    const [ isNextTripFadedIn,       setIsNextTripFadedIn       ] = useState(false);
    const [ shouldLoopAnimation,     setShouldLoopAnimation     ] = useState(true);

    const nextTripViewOpacity = useRef(new Animated.Value(0)).current;

    const animateNextTripTimeOpacity = ({ toValue, onFinished = () => {} }) => {
      Animated.timing(nextTripViewOpacity, {
        toValue:  toValue,
        duration: 500,
        useNativeDriver: true
      }).start((finished) => {
        if (finished) {
          console.debug(`animateNextTripTimeOpacity: finished = ${JSON.stringify(toValue)}, nextTripViewOpacity = ${JSON.stringify(nextTripViewOpacity)}, shouldLoopAnimation = ${JSON.stringify(shouldLoopAnimation)}`);

          onFinished();
        }
      });
    };

    const fadeInNextTripTime = () => {
      animateNextTripTimeOpacity({
        toValue:    1,
        onFinished: () => { setIsNextTripFadedIn(true); }
      });
    };

    const fadeOutNextTripTime = () => {
      animateNextTripTimeOpacity({
        toValue:    0,
        onFinished: () => { setIsNextTripFadedIn(false); }
      });
    };

    const crash = message => { setCrashMessage(message); };

    const fetchHFRemainingTimeByStationId = async (originId, isGoingToTerminal) => {
      let url  = process.env.HIGH_ACCURACY_ETA_URL + '/estaciones.asp',
          body = new URLSearchParams({ idEst: originId }).toString();

      console.debug(`fetchHFRemainingTimeByStationId: url = ${url}, body = ${body}`);

      await fetch(url, {
        method:   'POST',
        body:     body,
        headers:  { 'Content-Type': 'application/x-www-form-urlencoded' }
      }).then(      response => response.text())
        .then(async html     => {
          console.debug('fetchHFRemainingTimeByStationId:', html);

          const dom   = IDomParser.parse(html),
                body  = dom.querySelector('body');

          console.debug('isGoingToTerminal:', isGoingToTerminal);

          let tableCount =  0,
              tableIndex = -1,
              table      = null;

          for (index in body.children) {
            let child = body.children[index];

            console.debug('child.tagName:', child.tagName);

            if (!child.tagName) { continue; }

            if (
              child.tagName.toLowerCase() == 'table'
              &&
              child.outerHTML.trim().length > 0
            ) {
              tableCount++;

              console.debug('child:', child.outerHTML);
              console.debug(`child.outerHTML: "${child.outerHTML}"`);
            }
          }

          console.log('tableCount:', tableCount);

          for (let index = 0; index < body.children.length; index++) {
            let child = body.children[index];

            if (!child.tagName) { continue; }

            if (
              child.tagName.toLowerCase() == 'table'
              &&
              child.outerHTML.trim().length > 0
            ) {
              table = child;

              tableIndex++;
            }

            if (table && !isGoingToTerminal) { break; }
          }

          if (table) {
            console.debug('table:',      table.outerHTML);
            console.debug('tableIndex:', tableIndex);

            let remainingMinutes = table.querySelector('.tdflecha').innerText().replaceAll(
              new RegExp('[^0-9]', 'g'),  // searchValue
              ''                          // replaceValue
            );

            console.debug('[string] remainingMinutes:', remainingMinutes);

            if (remainingMinutes.trim().length > 0) {
              remainingMinutes = parseInt(remainingMinutes);

              console.debug('[int] remainingMinutes:', remainingMinutes);

              const newNextTripTime = dayjs().add(remainingMinutes, 'minutes');

              setNextTripTime( newNextTripTime );

              console.debug('newNextTripTime:', newNextTripTime);
            } else {
              console.warn('Couldn\'t convert remainingMinutes to integer.');
            }
          }
        });
    };

    const fetchHighAccuracyRemainingTime = (originName, destinationName) => {
      originName      = originName.toLowerCase();
      destinationName = destinationName.toLowerCase();

      fetch(process.env.HIGH_ACCURACY_ETA_URL)
        .then(      response => response.text())
        .then(async html     => {
          console.debug('fetchHighAccuracyRemainingTime: html:', html);

          const dom = IDomParser.parse(html);

          let mainTables       = dom.querySelectorAll('#table_main'),
              liveStationsList = [],
              originIndex      = null,
              destinationIndex = null,
              currentRowIndex  = 0;

          let mainTable        = mainTables[ mainTables.length - 1 ],
              expectedTdCount  = mainTable.querySelector('tr').querySelectorAll('td').length;

          while (currentRowIndex < expectedTdCount) {
            mainTable.querySelectorAll('tr').forEach(tr => {
              let td = tr.querySelectorAll('td')[currentRowIndex];

              let id = td.getAttribute('onclick').replace(new RegExp('[^0-9]', 'g'), '').trim();

              if (id.length > 0) {
                liveStationsList.push({
                  id:   parseInt(id),
                  name: td.innerText()
                });
              }

              console.debug('td:',              td.outerHTML);
              console.debug('currentRowIndex:', currentRowIndex);
            });

            currentRowIndex++;
          }

          console.debug(liveStationsList);

          liveStationsList.forEach((station, index) => {
            let liveNameWord = normalizeSpecialCharacters(
              station.name
                .replaceAll(new RegExp('.* ', 'g'), '')
                .toLowerCase()
            );

            console.debug(`@${index} - (${station.id}) "${liveNameWord}"`);

            console.debug('destinationName:', destinationName, 'liveNameWord:', liveNameWord);

            if (
              normalizeSpecialCharacters(destinationName).indexOf(' ' + liveNameWord) > -1
              ||
              destinationName === liveNameWord
            ) {
              destinationIndex = index;
            }

            console.debug('originName:', originName, 'liveNameWord:', liveNameWord);

            if (
              normalizeSpecialCharacters(originName).indexOf(' ' + liveNameWord) > -1
              ||
              originName === liveNameWord
            ) {
              originIndex = index;
            }
          });

          if (originIndex === null || destinationIndex === null) {
            console.warn(`fetchHighAccuracyRemainingTime: originIndex = "${originIndex}", destinationIndex = "${destinationIndex}"`);

            return;
          }

          let isGoingToTerminal = destinationIndex < originIndex; // terminal = Retiro

          console.debug(`@${originIndex} origin:`,            liveStationsList[originIndex]);
          console.debug(`@${destinationIndex} destination:`,  liveStationsList[destinationIndex]);
          console.debug('isGoingToTerminal:',                 isGoingToTerminal);

          await fetchHFRemainingTimeByStationId(
            liveStationsList[originIndex].id, // originId
            isGoingToTerminal                 // isGoingToTerminal
          );
        })
        .catch(exception => {
          console.warn('Couldn\'t fetch live tracking data:', exception);
        })
        .finally(() => { setShouldLoopAnimation(false); });
    };

    const buildRemainingTimeMessage = () => {
      let remainingTime = dayjs.duration( nextTripTime.diff() ); // difference between now and nextTripTime

      console.debug('shouldTryNextDay:', shouldTryNextDay);
      console.debug(dayjs().format());
      console.debug(nextTripTime.format());

      let hours   = remainingTime.get('hour'),
          minutes = remainingTime.get('minute'),
          seconds = remainingTime.get('second'),
          remainingTimeMessage = '';

      console.debug('hours:',   hours);
      console.debug('minutes:', minutes);
      console.debug('seconds:', seconds);

      if (hours > 0) {
        remainingTimeMessage += `${hours} `;

        if (hours == 1) {
          remainingTimeMessage += `${Lang.t('hour')}`;
        } else {
          remainingTimeMessage += `${Lang.t('hours')}`;
        }
      }

      if (minutes > 0) {
        if (hours > 0) {
          remainingTimeMessage += ` ${Lang.t('and')} `;
        }

        // This logic accounts for the hidden seconds indicator on wearables.
        if (Platform.constants && Platform.constants.uiMode === 'watch') { minutes++; }

        if (minutes == 1) {
          remainingTimeMessage +=  `${minutes} ${Lang.t('minute')}`;
        } else {
          remainingTimeMessage +=  `${minutes} ${Lang.t('minutes')}`;
        }
      }

      if (
        hours == 0
        &&
        ((Platform.constants && Platform.constants.uiMode !== 'watch') || minutes == 0)
      ) {
        if (minutes > 0) {
          remainingTimeMessage += ` ${Lang.t('and')} `;
        }

        remainingTimeMessage += `${seconds} `;

        if (seconds == 1) {
          remainingTimeMessage += `${Lang.t('second')}`;
        } else {
          remainingTimeMessage += `${Lang.t('seconds')}`;
        }
      }

      if (hours == 0 && seconds == 0 && minutes == 0) {
        remainingTimeMessage = Lang.t('hurryUpMessage');
      } else {
        remainingTimeMessage = `(${Lang.t('nextTripRemainingTimeMessage').replace('%s', remainingTimeMessage)})`;
      }

      console.debug('remainingTimeMessage:', remainingTimeMessage);

      return remainingTimeMessage;
    };

    const isHoliday = dayjsInstance => {
      let holidaysList = route.params.holidaysList;

      let currentDay   = dayjsInstance.date(),
          currentMonth = dayjsInstance.month() + 1;

      for (let index = 0; index < holidaysList.length; index++) {
          let holiday = holidaysList[index];

          // console.log(
          //     holiday.dia + ' == ' + currentDay +
          //     ' && ' +
          //     holiday.mes + ' == ' + currentMonth
          // );

          if (
              holiday.dia == currentDay
              &&
              holiday.mes == currentMonth
          ) { return true; }
      }

      return false;
    };
    
    const getTargetSegment = (dayjsInstance = dayjs()) => {
      console.debug(`getTargetSegment: ${dayjsInstance.format()}`);

      let segmentsList = route.params.segmentsList;

      let lookForHolidaySegment = isHoliday(dayjsInstance);

      console.debug('todayIsHoliday:', lookForHolidaySegment);

      let segmentIds = Object.keys(segmentsList);

      let targetSegment = null;

      let dayOfWeek = dayjsInstance.day();

      for (let index = 0; index < segmentIds.length; index++) {
        let segmentName = segmentsList[ segmentIds[index] ].toLowerCase();
            segmentName = normalizeSpecialCharacters(segmentName);

        console.debug('VS:', segmentIds[index], segmentName);

        // Holidays
        if (lookForHolidaySegment && segmentName.indexOf('feriado') > -1) {
          targetSegment = segmentIds[index];

          break;
        }

        // Sunday
        if (dayOfWeek == 0 && segmentName.indexOf('domingo') > -1) {
          targetSegment = segmentIds[index];

          break;
        }

        // Saturday
        if (dayOfWeek == 6 && segmentName.indexOf('sabado') > -1) {
          targetSegment = segmentIds[index];

          break;
        }

        // Keep looking for the segment dedicated to holidays
        if (lookForHolidaySegment) { continue; }

        // Between monday (1) and friday (5)
        if (dayOfWeek > 0 && dayOfWeek < 6) {
          targetSegment = segmentIds[index];

          break;
        }
      }

      if (!targetSegment) {
        console.error('getTargetSegment: couldn\'t detect schedule segment.');

        crash( Lang.t('getTargetSegmentError') );
      }

      console.debug('VST:', targetSegment);

      return targetSegment;
    };

    const processScheduleOptions = (date, options, originName, destinationName) => {
      setCurrentOperation( Lang.t('processingScheduleMessage') + '…' );

      let differenceMilliseconds;

      for (let index = 0; index < options.length; index++) {
        let tripTimeSpan = options[index],
          [ tripStartTime, tripEndTime      ] = tripTimeSpan,
          [ tripStartHour, tripStartMinutes ] = tripStartTime.split(':');

        let comparedDate = date.hour(tripStartHour).minute(tripStartMinutes);

        differenceMilliseconds = comparedDate.diff(date);

        console.debug('TDF:',   differenceMilliseconds);
        console.debug('TCMPA:', date.format());
        console.debug('TCMPB:', comparedDate.format());

        if (differenceMilliseconds >= 0) {
          console.debug('NTT:', tripStartTime);

          setNextTripTime(comparedDate);

          if (typeof(options[index + 1]) != 'undefined') {
            setAlternativeNextTripTime(options[index + 1][0]);
          }

          fetchHighAccuracyRemainingTime(originName, destinationName);

          break;
        }
      }

      if (differenceMilliseconds <= 0) {
        setShouldTryNextDay(true);
      }
    };

    const fetchNextTripTime = async (originName, destinationName, date = dayjs()) => {
      setCurrentOperation( Lang.t('fetchingNextTripTimeMessage') + '…' );

      let segment = getTargetSegment(date);

      if (!segment) { return; }

      let compiledURL = process.env.REMOTE_BASE_URL + `/schedule_${segment}.${route.params.origin.id}.${route.params.destination.id}_data.json`;

      console.debug('Date:', date.format());
      console.debug('URL:',  compiledURL);

      await fetch(compiledURL)
        .then(response => response.json())
        .then(json => {
          console.log(json);

          Cache.set(compiledURL, json);

          processScheduleOptions(date, json, originName, destinationName);
        })
        .catch(async exception => {
          let cachedData = await Cache.get(compiledURL);

          if (cachedData) {
            console.warn('fetchNextTripTime: couldn\'t query, falling back to cached response.');

            setNetworkErrorDetected(true);

            processScheduleOptions(date, cachedData, originName, destinationName);
          } else {
            console.error('fetchNextTripTime: couldn\t query:', exception);

            crash( Lang.t('fetchNextTripTimeError') );
          }
        });
    };

    // Runs once during the startup
    useEffect(() => {
      console.debug('params:', route.params);

      fetchNextTripTime(
        route.params.origin.title,
        route.params.destination.title
      );

      fadeInNextTripTime();

      AppState.addEventListener('change', nextAppState => {
        if (nextAppState !== 'active') { // disable vibration if in background mode
          console.debug(`The app has just left the "active" state and is now marked "${nextAppState}", disabling repeating vibration pattern...`);

          Vibration.cancel();
        }
      });
    }, []);

    // Detects changes in nextTripTime, if it's under zero, tries with the next day
    useEffect(() => {
      if (typeof(nextTripTime) == 'undefined') { return; }

      setTimeout(() => {
        if (typeof(nextTripTime) == 'undefined') { return; }

        const nextRemainingMillis = nextTripTime.diff();

        if (nextRemainingMillis >= 0) {
          setRemainingTimeMessage( buildRemainingTimeMessage() );
          setRemainingTimeMillis( nextRemainingMillis );
        } else {
          Vibration.vibrate([ 1000, 75, 500, 75, 2500 ], true);
        }
      }, 1000);
    }, [ nextTripTime, remainingTimeMillis ]);

    // Detect next trip time fade completed
    useEffect(() => {
      if (!shouldLoopAnimation) { return; }

      console.debug(`useEffect: isNextTripFadedIn: ${JSON.stringify(isNextTripFadedIn)}`);

      if (isNextTripFadedIn) {
        fadeOutNextTripTime();
      } else {
        fadeInNextTripTime();
      }
    }, [ isNextTripFadedIn ]);

    useEffect(() => {
      if (!shouldTryNextDay) { return; }

      console.info('No trips available today, trying with the next day...');

      let date = dayjs();

      // Try with the next day
      date = date.add(1, 'day');
      date = date.hour(0);
      date = date.minute(0);
      date = date.second(0);

      fetchNextTripTime(
        route.params.origin.title,
        route.params.destination.title,
        date
      );
    }, [ shouldTryNextDay ]);

    console.debug('Remaining MS:', (
      typeof(nextTripTime) == 'undefined'
        ? 'undefined'
        : nextTripTime.diff()
    ));

    if (typeof(crashMessage) != 'undefined') {
      console.error(crashMessage);

      return (
        <View style={styles.container}>
            <Text style={styles.centeredText}>
              {crashMessage}
            </Text>
        </View>
      );
    }

    return (
        <SafeAreaView style={styles.container}>
          <OfflineModeHint isOffline={networkErrorDetected} navigation={navigation} />
          {
              typeof(nextTripTime)         == 'undefined'
              ||
              typeof(remainingTimeMessage) == 'undefined'
                ? <View>
                    <ActivityIndicator size="12" color="#be4936" />
                    <Text style={{ color: 'white', textAlign: 'center' }}>
                      {currentOperation}
                    </Text>
                  </View>
                : (
                  nextTripTime.diff() < 0
                    ? <Text style={styles.centeredText}>
                        {Lang.t('noTripsFoundMessage')}
                      </Text>
                    : <View>
                        <Text style={styles.centeredBoldText}>
                          {route.params.origin.title}
                        </Text>
                        <Text style={styles.centeredText}>
                          <Icon name="chevron-double-right" size={16} color='white' />
                        </Text>
                        <Text style={styles.centeredBoldText}>
                          {route.params.destination.title}
                        </Text>
                        <Text style={styles.centeredText}>
                          {Lang.t('nextTripScheduleForMessage')}
                        </Text>
                        <Animated.View
                          style={{
                            opacity:
                              shouldLoopAnimation
                                ? nextTripViewOpacity
                                : 1
                          }}
                        >
                          <Text style={styles.centeredLargeBoldText}>
                            {nextTripTime.format('HH:mm')}
                          </Text>
                        </Animated.View>
                        <Text style={styles.centeredThinText}>
                          {remainingTimeMessage}
                        </Text>
                        {
                          alternativeNextTripTime
                            ? <Text style={[
                                styles.centeredThinText,
                                {
                                  fontSize: (
                                    Dimensions.get('screen').width < 320
                                      ? 10
                                      : 12
                                  ),
                                  color: '#999999'
                                }
                              ]}>
                                {Lang.t('alternativeTripStartTimeMessage')} <Text style={{ fontWeight: 'bold' }}>{alternativeNextTripTime}</Text>.
                              </Text>
                            : <View />
                        }
                      </View>
                )
          }

          {
            typeof(nextTripTime)         == 'undefined'
            ||
            typeof(remainingTimeMessage) == 'undefined' 
              ? <View></View>
              : <ActivityIndicator size={16} color="#fff" style={[ styles.haTimeLoader, (shouldLoopAnimation ? {} : { display: 'none' }) ]} />
          }
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    color: '#fff',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingVertical: (
      Platform.constants && Platform.constants.uiMode === 'watch'
        ? 32
        : 16
    )
  },
  title: { textAlign: 'center' },
  centeredText: {
    color: '#fff',
    fontSize: (
      Dimensions.get('screen').width < 320
        ? 11
        : 15
    ),
    fontWeight: 'normal',
    textAlign: 'center'
  },
  centeredBoldText: {
    color: '#fff',
    fontSize: (
      Dimensions.get('screen').width < 320
        ? 12
        : 16
    ),
    fontWeight: 'bold',
    textAlign: 'center'
  },
  centeredLargeBoldText: {
    color: '#fff',
    fontSize: (
      Dimensions.get('screen').width < 320
        ? 20
        : 30
    ),
    fontWeight: 'bold',
    textAlign: 'center'
  },
  centeredThinText: {
    color: '#fff',
    fontSize: (
      Dimensions.get('screen').width < 320
        ? 10
        : 12
    ),
    fontWeight: '300',
    textAlign: 'center'
  },
  haTimeLoader: [
    { position: 'absolute' },
    (
      Platform.constants && Platform.constants.uiMode === 'watch'
        ? { bottom: 4 }
        : {
          top:   16,
          right: 16
        }
    )
  ]
});
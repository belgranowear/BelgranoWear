import normalizeSpecialCharacters from 'specialtonormal';

import React, { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  AppState,
  SafeAreaView,
  StyleSheet,
  Platform,
  Text,
  View,
  Vibration
} from 'react-native';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import dayjs    from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

import Cache    from '../includes/Cache';
import Lang     from '../includes/Lang';

import OfflineModeHint from './OfflineModeHint';

export default function NextSchedule({ navigation, route }) {
    const [ crashMessage,            setCrashMessage            ] = useState();
    const [ remainingTimeMessage,    setRemainingTimeMessage    ] = useState();
    const [ nextTripTime,            setNextTripTime            ] = useState();
    const [ alternativeNextTripTime, setAlternativeNextTripTime ] = useState();
    const [ shouldTryNextDay,        setShouldTryNextDay        ] = useState();
    const [ networkErrorDetected,    setNetworkErrorDetected    ] = useState();
    const [ currentOperation,        setCurrentOperation        ] = useState();

    const crash = message => { setCrashMessage(message); };

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

        if (minutes == 1) {
          remainingTimeMessage +=  `${minutes} ${Lang.t('minute')}`;
        } else {
          remainingTimeMessage +=  `${minutes} ${Lang.t('minutes')}`;
        }
      }

      if (hours == 0) {
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

      if (seconds == 0 && minutes == 0) {
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

    const processScheduleOptions = (date, options) => {
      setCurrentOperation( Lang.t('processingScheduleMessage') + '…' );

      let differenceMilliseconds;

      for (let index = 0; index < options.length; index++) {
        let tripTimeSpan = options[index],
          [ tripStartTime, tripEndTime      ] = tripTimeSpan,
          [ tripStartHour, tripStartMinutes ] = tripStartTime.split(':');

        let comparedDate = date.hour(tripStartHour).minute(tripStartMinutes);

        differenceMilliseconds = comparedDate.diff(date);

        // console.debug('TST:', tripStartTime, ':', tripEndTime);
        // console.debug('TSP:', tripStartHour, ':', tripStartMinutes);
        console.debug('TDF:',   differenceMilliseconds);
        console.debug('TCMPA:', date.format());
        console.debug('TCMPB:', comparedDate.format());

        if (differenceMilliseconds >= 0) {
          console.debug('NTT:', tripStartTime);

          setNextTripTime(comparedDate);

          if (typeof(options[index + 1]) != 'undefined') {
            setAlternativeNextTripTime(options[index + 1][0]);
          }

          break;
        }
      }

      if (differenceMilliseconds <= 0) {
        setShouldTryNextDay(true);
      }
    };

    const fetchNextTripTime = async (date = dayjs()) => {
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

          processScheduleOptions(date, json);
        })
        .catch(async exception => {
          let cachedData = await Cache.get(compiledURL);

          if (cachedData) {
            console.warn('fetchNextTripTime: couldn\'t query, falling back to cached response.');

            setNetworkErrorDetected(true);

            processScheduleOptions(date, cachedData);
          } else {
            console.error('fetchNextTripTime: couldn\t query:', exception);

            crash( Lang.t('fetchNextTripTimeError') );
          }
        });
    };

    // Runs once during the startup
    useEffect(() => {
      console.debug('params:', route.params);

      fetchNextTripTime();

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

        let remainingTimeMillis = nextTripTime.diff();

        if (remainingTimeMillis >= 0) {
          setRemainingTimeMessage( buildRemainingTimeMessage() );
        } else {
          Vibration.vibrate([ 1000, 75, 500, 75, 2500 ], true);
        }
      }, 1000);
    }, [ nextTripTime, remainingTimeMessage ]);

    useEffect(() => {
      if (!shouldTryNextDay) { return; }

      console.info('No trips available today, trying with the next day...');

      let date = dayjs();

      // Try with the next day
      date = date.add(1, 'day');
      date = date.hour(0);
      date = date.minute(0);
      date = date.second(0);

      fetchNextTripTime(date);
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
                    : <View style={styles.topPaddedView}>
                        <Text style={styles.centeredText}>
                          <Text style={styles.centeredBoldText}>{route.params.origin.title}</Text>
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
                        <Text style={styles.centeredLargeBoldText}>
                          {nextTripTime.format('HH:mm')}
                        </Text>
                        <Text style={styles.centeredThinText}>
                          {remainingTimeMessage}
                        </Text>
                        {
                          alternativeNextTripTime
                            ? <Text style={[ styles.centeredThinText, { fontSize: 13, color: '#999999' } ]}>
                                {Lang.t('alternativeTripStartTimeMessage')} <Text style={{ fontWeight: 'bold' }}>{alternativeNextTripTime}</Text>.
                              </Text>
                            : <View />
                        }
                      </View>
                )
          }

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
  topPaddedView: {
    marginTop: (Platform.constants.uiMode == 'watch' ? -24 : 0) // avoid layout clipping on rounded watches
  },
  container: {
    flex: 1,
    width: '100%',
    color: '#fff',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingVertical: 0
  },
  title: { textAlign: 'center' },
  centeredText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'normal',
    textAlign: 'center'
  },
  centeredBoldText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  centeredLargeBoldText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  centeredThinText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '300',
    textAlign: 'center'
  }
});
import normalizeSpecialCharacters from 'specialtonormal';

import React, { useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator as RNActivityIndicator,
  Animated,
  AppState,
  Platform,
  StyleSheet,
  Vibration,
  View
} from 'react-native';

import IDomParser from 'advanced-html-parser';

import dayjs    from 'dayjs';
import duration     from 'dayjs/plugin/duration';

dayjs.extend(duration);

import {
  Button,
  Divider,
  IconButton,
  List,
  Text
} from 'react-native-paper';

import Cache       from '../includes/Cache';
import Lang        from '../includes/Lang';
import Preferences from '../includes/Preferences';
import Reminders   from '../includes/Reminders';
import { getUIPreviewMode, isWatchUIPreview } from '../includes/UIPreview';

import OfflineModeHint from './OfflineModeHint';
import { AppScreen, StatusPill, TransitCard, useResponsiveMetrics } from './ui';
import { useTheme } from '../includes/Theme';

const SOURCE = {
  LIVE:      'live',
  SCHEDULED: 'scheduled',
  OFFLINE:   'offline'
};

const sourceLabel = source => ({
  [SOURCE.LIVE]:      Lang.t('sourceLiveEstimate'),
  [SOURCE.SCHEDULED]: Lang.t('sourceScheduledTime'),
  [SOURCE.OFFLINE]:   Lang.t('sourceOfflineCached')
}[source] || Lang.t('sourceScheduledTime'));

const sourceTone = source => ({
  [SOURCE.LIVE]:      'success',
  [SOURCE.SCHEDULED]: 'neutral',
  [SOURCE.OFFLINE]:   'offline'
}[source] || 'neutral');

const formatDurationUnit = (value, singularKey, pluralKey) => `${value} ${Lang.t(value === 1 ? singularKey : pluralKey)}`;

const formatDepartureDelta = departure => {
  const remaining = dayjs.duration(departure.diff());
  const hours     = Math.max(0, remaining.get('hour'));
  const minutes   = Math.max(0, remaining.get('minute'));

  if (hours > 0) {
    if (minutes > 0) {
      return [
        formatDurationUnit(hours, 'hour', 'hours'),
        formatDurationUnit(minutes, 'minute', 'minutes')
      ].join(` ${Lang.t('and')} `);
    }

    return formatDurationUnit(hours, 'hour', 'hours');
  }

  return formatDurationUnit(Math.max(1, minutes), 'minute', 'minutes');
};

export default function NextSchedule({ navigation, route }) {
    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const previewMode = getUIPreviewMode();
    const watchLayout = responsive.isWatch || isWatchUIPreview();
    const showInScreenBack = false;

    const [ crashMessage,            setCrashMessage            ] = useState();
    const [ remainingTimeMillis,     setRemainingTimeMillis     ] = useState();
    const [ remainingTimeMessage,    setRemainingTimeMessage    ] = useState();
    const [ nextTripTime,            setNextTripTime            ] = useState();
    const [ nextDepartures,          setNextDepartures          ] = useState([]);
    const [ shouldTryNextDay,        setShouldTryNextDay        ] = useState();
    const [ networkErrorDetected,    setNetworkErrorDetected    ] = useState();
    const [ currentOperation,        setCurrentOperation        ] = useState(Lang.t('fetchingNextTripTimeMessage') + '…');
    const [ isNextTripFadedIn,       setIsNextTripFadedIn       ] = useState(false);
    const [ shouldLoopAnimation,     setShouldLoopAnimation     ] = useState(true);
    const [ scheduleSource,          setScheduleSource          ] = useState(SOURCE.SCHEDULED);
    const [ isFavorite,              setIsFavorite              ] = useState(false);
    const [ reminderStatus,          setReminderStatus          ] = useState();

    const nextTripViewOpacity = useRef(new Animated.Value(0)).current;
    const fallbackReminderRef = useRef();

    const origin      = route.params.origin;
    const destination = route.params.destination;

    const animateNextTripTimeOpacity = ({ toValue, onFinished = () => {} }) => {
      Animated.timing(nextTripViewOpacity, {
        toValue,
        duration: theme.motion.normal,
        useNativeDriver: true
      }).start((finished) => {
        if (finished) { onFinished(); }
      });
    };

    const fadeInNextTripTime = () => {
      animateNextTripTimeOpacity({ toValue: 1, onFinished: () => { setIsNextTripFadedIn(true); } });
    };

    const fadeOutNextTripTime = () => {
      animateNextTripTimeOpacity({ toValue: 0, onFinished: () => { setIsNextTripFadedIn(false); } });
    };

    const crash = message => { setCrashMessage(message); };

    const refreshFavoriteState = async () => {
      setIsFavorite(await Preferences.isFavoriteTrip(origin, destination));
    };

    const fetchHFRemainingTimeByStationId = async (originId, isGoingToTerminal) => {
      let url  = process.env.HIGH_ACCURACY_ETA_URL + '/estaciones.asp',
          body = new URLSearchParams({ idEst: originId }).toString();

      await fetch(url, {
        method:   'POST',
        body:     body,
        headers:  { 'Content-Type': 'application/x-www-form-urlencoded' }
      }).then(      response => response.text())
        .then(async html     => {
          const dom   = IDomParser.parse(html),
                body  = dom.querySelector('body');

          let tableIndex = -1,
              table      = null;

          for (let index = 0; index < body.children.length; index++) {
            let child = body.children[index];

            if (!child.tagName) { continue; }

            if (child.tagName.toLowerCase() == 'table' && child.outerHTML.trim().length > 0) {
              table = child;
              tableIndex++;
            }

            if (table && !isGoingToTerminal) { break; }
          }

          if (table) {
            let remainingMinutes = table.querySelector('.tdflecha').innerText().replaceAll(new RegExp('[^0-9]', 'g'), '');

            if (remainingMinutes.trim().length > 0) {
              remainingMinutes = parseInt(remainingMinutes);
              const newNextTripTime = dayjs().add(remainingMinutes, 'minutes');
              setNextTripTime( newNextTripTime );
              setScheduleSource(SOURCE.LIVE);
            }
          }
        });
    };

    const fetchHighAccuracyRemainingTime = (originName, destinationName) => {
      originName      = originName.toLowerCase();
      destinationName = destinationName.toLowerCase();

      fetch(process.env.HIGH_ACCURACY_ETA_URL)
        .then(response => response.text())
        .then(async html => {
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
              if (id.length > 0) { liveStationsList.push({ id: parseInt(id), name: td.innerText() }); }
            });
            currentRowIndex++;
          }

          liveStationsList.forEach((station, index) => {
            let liveNameWord = normalizeSpecialCharacters(station.name.replaceAll(new RegExp('.* ', 'g'), '').toLowerCase());

            if (normalizeSpecialCharacters(destinationName).indexOf(' ' + liveNameWord) > -1 || destinationName === liveNameWord) { destinationIndex = index; }
            if (normalizeSpecialCharacters(originName).indexOf(' ' + liveNameWord) > -1 || originName === liveNameWord) { originIndex = index; }
          });

          if (originIndex === null || destinationIndex === null) { return; }

          await fetchHFRemainingTimeByStationId(liveStationsList[originIndex].id, destinationIndex < originIndex);
        })
        .catch(exception => { console.warn('Couldn\'t fetch live tracking data:', exception); })
        .finally(() => { setShouldLoopAnimation(false); });
    };

    const buildRemainingTimeMessage = () => {
      let remainingTime = dayjs.duration( nextTripTime.diff() );
      let hours   = remainingTime.get('hour'),
          minutes = remainingTime.get('minute'),
          seconds = remainingTime.get('second'),
          remainingTimeMessage = '';

      if (hours > 0) { remainingTimeMessage += `${hours} ${hours == 1 ? Lang.t('hour') : Lang.t('hours')}`; }

      if (minutes > 0) {
        if (hours > 0) { remainingTimeMessage += ` ${Lang.t('and')} `; }
        if (Platform.constants && Platform.constants.uiMode === 'watch') { minutes++; }
        remainingTimeMessage += `${minutes} ${minutes == 1 ? Lang.t('minute') : Lang.t('minutes')}`;
      }

      if (hours == 0 && ((Platform.constants && Platform.constants.uiMode !== 'watch') || minutes == 0)) {
        if (minutes > 0) { remainingTimeMessage += ` ${Lang.t('and')} `; }
        remainingTimeMessage += `${seconds} ${seconds == 1 ? Lang.t('second') : Lang.t('seconds')}`;
      }

      if (hours == 0 && seconds == 0 && minutes == 0) { return Lang.t('hurryUpMessage'); }

      return `(${Lang.t('nextTripRemainingTimeMessage').replace('%s', remainingTimeMessage)})`;
    };

    const isHoliday = dayjsInstance => {
      let holidaysList = route.params.holidaysList || [];
      let currentDay = dayjsInstance.date(), currentMonth = dayjsInstance.month() + 1;
      for (let index = 0; index < holidaysList.length; index++) {
          let holiday = holidaysList[index];
          if (holiday.dia == currentDay && holiday.mes == currentMonth) { return true; }
      }
      return false;
    };

    const getTargetSegment = (dayjsInstance = dayjs()) => {
      let segmentsList = route.params.segmentsList || { 1: 'Lunes a viernes', 2: 'Sábado', 3: 'Domingo' };
      let lookForHolidaySegment = isHoliday(dayjsInstance);
      let segmentIds = Object.keys(segmentsList);
      let targetSegment = null;
      let dayOfWeek = dayjsInstance.day();

      for (let index = 0; index < segmentIds.length; index++) {
        let segmentName = normalizeSpecialCharacters(segmentsList[ segmentIds[index] ].toLowerCase());
        if (lookForHolidaySegment && segmentName.indexOf('feriado') > -1) { targetSegment = segmentIds[index]; break; }
        if (dayOfWeek == 0 && segmentName.indexOf('domingo') > -1) { targetSegment = segmentIds[index]; break; }
        if (dayOfWeek == 6 && segmentName.indexOf('sabado') > -1) { targetSegment = segmentIds[index]; break; }
        if (lookForHolidaySegment) { continue; }
        if (dayOfWeek > 0 && dayOfWeek < 6) { targetSegment = segmentIds[index]; break; }
      }

      if (!targetSegment) { crash( Lang.t('getTargetSegmentError') ); }
      return targetSegment;
    };

    const processScheduleOptions = (date, options, originName, destinationName, source = SOURCE.SCHEDULED) => {
      setCurrentOperation( Lang.t('processingScheduleMessage') + '…' );
      setScheduleSource(source);

      let differenceMilliseconds;
      const nextOptions = [];

      for (let index = 0; index < options.length; index++) {
        let [ tripStartTime ] = options[index],
            [ tripStartHour, tripStartMinutes ] = tripStartTime.split(':');

        let comparedDate = date.hour(tripStartHour).minute(tripStartMinutes);
        differenceMilliseconds = comparedDate.diff(date);

        if (differenceMilliseconds >= 0) {
          nextOptions.push(comparedDate);
          if (nextOptions.length === 1) { setNextTripTime(comparedDate); }
          if (nextOptions.length >= 3) { break; }
        }
      }

      setNextDepartures(nextOptions);

      if (nextOptions.length > 0 && !previewMode) { fetchHighAccuracyRemainingTime(originName, destinationName); }
      else { setShouldLoopAnimation(false); }

      if (differenceMilliseconds <= 0 || nextOptions.length === 0) { setShouldTryNextDay(true); }
    };

    const fetchNextTripTime = async (originName, destinationName, date = dayjs()) => {
      setCurrentOperation( Lang.t('fetchingNextTripTimeMessage') + '…' );

      let segment = getTargetSegment(date);
      if (!segment) { return; }

      let compiledURL = process.env.REMOTE_BASE_URL + `/schedule_${segment}.${route.params.origin.id}.${route.params.destination.id}_data.json`;

      await fetch(compiledURL)
        .then(response => response.json())
        .then(json => {
          Cache.set(compiledURL, json);
          processScheduleOptions(date, json, originName, destinationName, SOURCE.SCHEDULED);
        })
        .catch(async exception => {
          let cachedData = await Cache.get(compiledURL);

          if (cachedData) {
            setNetworkErrorDetected(true);
            processScheduleOptions(date, cachedData, originName, destinationName, SOURCE.OFFLINE);
          } else {
            console.error('fetchNextTripTime: couldn\t query:', exception);
            crash( Lang.t('fetchNextTripTimeError') );
          }
        });
    };

    const retry = () => {
      setCrashMessage(undefined);
      setRemainingTimeMessage(undefined);
      setNextTripTime(undefined);
      setNextDepartures([]);
      setShouldLoopAnimation(true);
      setShouldTryNextDay(false);
      fetchNextTripTime(origin.title, destination.title);
      fadeInNextTripTime();
    };

    const toggleFavorite = async () => {
      const nowFavorite = await Preferences.toggleFavoriteTrip(origin, destination);
      setIsFavorite(nowFavorite);
      setReminderStatus(nowFavorite ? Lang.t('routeSavedMessage') : Lang.t('routeRemovedMessage'));
    };

    const reverseRoute = () => {
      navigation.replace('NextSchedule', {
        origin:       destination,
        destination:  origin,
        segmentsList: route.params.segmentsList,
        holidaysList: route.params.holidaysList
      });
    };

    const setForegroundFallbackReminder = () => {
      const reminderDate = nextTripTime.subtract(5, 'minute');
      const delayMs = reminderDate.diff();
      if (delayMs <= 0) { return false; }
      if (fallbackReminderRef.current) { clearTimeout(fallbackReminderRef.current); }
      fallbackReminderRef.current = setTimeout(() => {
        Vibration.vibrate([ 250, 125, 250 ]);
      }, delayMs);
      return true;
    };

    const setDepartureReminder = async () => {
      if (!nextTripTime) { return; }
      const result = await Reminders.scheduleDepartureReminder({ origin, destination, departureTime: nextTripTime });
      if (!result.ok && result.reason === 'unavailable' && setForegroundFallbackReminder()) {
        setReminderStatus(Lang.t('reminderSetMessage'));
        return;
      }
      setReminderStatus(result.message);
    };

    useEffect(() => {
      refreshFavoriteState();

      if (previewMode === 'schedule' || previewMode === 'watch' || previewMode === 'watch-schedule') {
        const previewDepartures = [ dayjs().add(14, 'minute'), dayjs().add(36, 'minute'), dayjs().add(58, 'minute') ];
        setNextTripTime(previewDepartures[0]);
        setNextDepartures(previewDepartures);
        setRemainingTimeMessage(`(${Lang.t('nextTripRemainingTimeMessage').replace('%s', `14 ${Lang.t('minutes')}`)})`);
        setRemainingTimeMillis(previewDepartures[0].diff());
        setScheduleSource(SOURCE.LIVE);
        setShouldLoopAnimation(false);
        return;
      }

      fetchNextTripTime(origin.title, destination.title);
      fadeInNextTripTime();

      const subscription = AppState.addEventListener('change', nextAppState => {
        if (nextAppState !== 'active') { Vibration.cancel(); }
      });

      return () => {
        subscription?.remove?.();
        if (fallbackReminderRef.current) { clearTimeout(fallbackReminderRef.current); }
        Vibration.cancel();
      };
    }, [ origin.id, destination.id ]);

    useEffect(() => {
      if (typeof(nextTripTime) == 'undefined') { return; }

      const timeout = setTimeout(() => {
        if (typeof(nextTripTime) == 'undefined') { return; }
        const nextRemainingMillis = nextTripTime.diff();
        if (nextRemainingMillis >= 0) {
          setRemainingTimeMessage( buildRemainingTimeMessage() );
          setRemainingTimeMillis( nextRemainingMillis );
        } else {
          Vibration.vibrate([ 1000, 75, 500, 75, 2500 ], true);
        }
      }, 1000);

      return () => clearTimeout(timeout);
    }, [ nextTripTime, remainingTimeMillis ]);

    useEffect(() => {
      if (!shouldLoopAnimation) { return; }
      if (isNextTripFadedIn) { fadeOutNextTripTime(); }
      else { fadeInNextTripTime(); }
    }, [ isNextTripFadedIn ]);

    useEffect(() => {
      if (!shouldTryNextDay || previewMode) { return; }
      let date = dayjs().add(1, 'day').hour(0).minute(0).second(0);
      fetchNextTripTime(origin.title, destination.title, date);
    }, [ shouldTryNextDay ]);

    if (crashMessage) {
      return (
        <AppScreen>
          <TransitCard>
            <Text variant="titleMedium" style={styles.centerText}>{crashMessage}</Text>
            <Button mode="contained" onPress={retry}>{Lang.t('retryBtnLabel')}</Button>
          </TransitCard>
        </AppScreen>
      );
    }

    const isLoading = typeof(nextTripTime) == 'undefined' || typeof(remainingTimeMessage) == 'undefined';

    if (isLoading) {
      return (
        <AppScreen scroll={false} contentStyle={styles.centerContent}>
          <TransitCard style={styles.loadingCard}>
            <RNActivityIndicator color={theme.accent} accessibilityLabel={currentOperation} />
            <Text variant="titleMedium" style={styles.centerText}>{currentOperation}</Text>
          </TransitCard>
        </AppScreen>
      );
    }

    return (
        <AppScreen contentStyle={[ styles.stackGap, watchLayout ? styles.stackGapWatch : undefined ]}>
          <View style={[ styles.headerRow, watchLayout ? styles.headerRowWatch : undefined ]}>
            {showInScreenBack ? (
              <IconButton icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel={Lang.t('goBackBtnLabel')} />
            ) : !watchLayout ? (
              <View style={styles.headerActionSlot} />
            ) : null}
            <View style={styles.headerText}>
              <Text variant={watchLayout ? 'titleMedium' : 'titleLarge'} style={[ styles.routeTitle, watchLayout ? styles.routeTitleWatch : undefined ]} numberOfLines={watchLayout ? 1 : 2}>{origin.title}</Text>
              <Text variant={watchLayout ? 'bodySmall' : 'bodyMedium'} style={[ styles.routeSubtitle, watchLayout ? styles.routeSubtitleWatch : undefined ]} numberOfLines={watchLayout ? 1 : 2}>→ {destination.title}</Text>
            </View>
            {!watchLayout ? <IconButton icon={isFavorite ? 'star' : 'star-outline'} onPress={toggleFavorite} accessibilityLabel={isFavorite ? Lang.t('removeFavoriteBtnLabel') : Lang.t('addFavoriteBtnLabel')} /> : null}
          </View>

          <TransitCard style={[ styles.departureBoard, watchLayout ? styles.departureBoardWatch : undefined ]}>
            {!watchLayout ? <View style={styles.boardTopRow}>
              <StatusPill tone={sourceTone(scheduleSource)}>{sourceLabel(scheduleSource)}</StatusPill>
              <OfflineModeHint isOffline={networkErrorDetected} sourceLabel={sourceLabel(scheduleSource)} navigation={navigation} />
            </View> : null}
            {!watchLayout ? <Text variant="labelLarge" style={styles.boardLabel}>{Lang.t('nextTripScheduleForMessage')}</Text> : null}
            <Animated.View style={{ opacity: shouldLoopAnimation ? nextTripViewOpacity : 1 }}>
              <Text variant={watchLayout ? 'displayMedium' : 'displayLarge'} style={styles.heroTime} accessibilityLabel={`${sourceLabel(scheduleSource)} ${nextTripTime.format('HH:mm')}`}>
                {nextTripTime.format('HH:mm')}
              </Text>
            </Animated.View>
            {watchLayout ? (
              <>
                <Text variant="titleMedium" style={styles.remainingTextWatch}>{remainingTimeMessage}</Text>
                <Text variant="labelSmall" style={styles.sourceTextWatch}>{sourceLabel(scheduleSource)}</Text>
                <OfflineModeHint isOffline={networkErrorDetected} sourceLabel={sourceLabel(scheduleSource)} navigation={navigation} />
              </>
            ) : (
              <StatusPill icon="clock-outline" tone="accent" style={styles.remainingPill}>{remainingTimeMessage}</StatusPill>
            )}
          </TransitCard>

          {nextDepartures.length > 1 && !watchLayout ? (
            <TransitCard>
              <Text variant="titleMedium" style={styles.sectionTitle}>{Lang.t('nextDeparturesTitle')}</Text>
              {nextDepartures.map((departure, index) => (
                <View key={departure.toISOString()}>
                  <List.Item
                    title={departure.format('HH:mm')}
                    description={index === 0 ? sourceLabel(scheduleSource) : Lang.t('sourceScheduledTime')}
                    left={props => <List.Icon {...props} icon={index === 0 ? 'train' : 'clock-outline'} />}
                    right={() => <Text variant="bodyMedium" style={styles.departureDelta}>{formatDepartureDelta(departure)}</Text>}
                    style={styles.departureRow}
                  />
                  {index < nextDepartures.length - 1 ? <Divider /> : null}
                </View>
              ))}
            </TransitCard>
          ) : null}

          <View style={[ styles.actions, watchLayout ? styles.actionsWatch : undefined ]}>
            {!watchLayout ? (
              <Button mode="outlined" icon="swap-horizontal" onPress={reverseRoute} compact={watchLayout}>{Lang.t('reverseRouteBtnLabel')}</Button>
            ) : null}
            <Button mode="contained-tonal" icon="bell-outline" onPress={setDepartureReminder} compact={watchLayout}>{Lang.t('remindMeBtnLabel')}</Button>
          </View>

          {reminderStatus ? <StatusPill tone="accent" style={styles.statusMessage}>{reminderStatus}</StatusPill> : null}

          {!watchLayout && shouldLoopAnimation ? <RNActivityIndicator color={theme.accent} style={styles.haTimeLoader} /> : null}
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
    gap: 8,
    justifyContent: 'flex-start'
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  headerRowWatch: {
    justifyContent: 'center',
    minHeight: 52
  },
  headerActionSlot: {
    width: 48,
    height: 48
  },
  headerText: {
    flex: 1,
    alignItems: 'center'
  },
  routeTitle: {
    fontWeight: '900',
    textAlign: 'center'
  },
  routeTitleWatch: {
    fontWeight: '900'
  },
  routeSubtitle: {
    textAlign: 'center'
  },
  routeSubtitleWatch: {
    opacity: 0.9
  },
  departureBoard: {
    alignItems: 'stretch'
  },
  departureBoardWatch: {
    alignItems: 'center'
  },
  boardTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center'
  },
  boardLabel: {
    textAlign: 'center',
    marginTop: 10,
    opacity: 0.75
  },
  heroTime: {
    textAlign: 'center',
    fontWeight: '900',
    letterSpacing: 1,
    marginVertical: 4
  },
  remainingPill: {
    alignSelf: 'center'
  },
  remainingTextWatch: {
    textAlign: 'center',
    fontWeight: '800',
    marginTop: 2
  },
  sourceTextWatch: {
    textAlign: 'center',
    opacity: 0.62,
    marginTop: 2
  },
  sectionTitle: {
    fontWeight: '800',
    marginBottom: 4
  },
  departureRow: {
    paddingHorizontal: 0
  },
  departureDelta: {
    alignSelf: 'center',
    opacity: 0.72
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8
  },
  actionsWatch: {
    flexDirection: 'column',
    alignItems: 'center'
  },
  statusMessage: {
    alignSelf: 'center'
  },
  haTimeLoader: {
    position: 'absolute',
    top: 16,
    right: 16
  }
});

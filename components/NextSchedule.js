import normalizeSpecialCharacters from 'specialtonormal';

import React, { useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator as RNActivityIndicator,
  Animated,
  AppState,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Vibration,
  View
} from 'react-native';

import IDomParser from 'advanced-html-parser';

import dayjs    from 'dayjs';
import duration     from 'dayjs/plugin/duration';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

dayjs.extend(duration);

import {
  Button,
  Divider,
  IconButton,
  List,
  Switch,
  Text
} from 'react-native-paper';

import Cache       from '../includes/Cache';
import Lang        from '../includes/Lang';
import Preferences from '../includes/Preferences';
import Reminders   from '../includes/Reminders';
import { getUIPreviewMode, isWatchUIPreview } from '../includes/UIPreview';

import OfflineModeHint from './OfflineModeHint';
import { AppScreen, StatusPill, TransitCard, WatchScaleItem, useResponsiveMetrics } from './ui';
import { useTheme } from '../includes/Theme';

const SOURCE = {
  LIVE:      'live',
  SCHEDULED: 'scheduled',
  OFFLINE:   'offline'
};

const SCHEDULE_SCROLL_HINT_FULL_SCROLL_LIMIT = 3;


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

const getWatchRemainingTimeFontSize = (message, shortestSide) => {
  const safeTextWidth = shortestSide * 0.72;
  const textLength    = Math.max(String(message || Lang.t('hurryUpMessage')).length, 1);
  const fittedSize    = Math.floor(safeTextWidth / (textLength * 0.55));

  return Math.max(13, Math.min(18, fittedSize));
};

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

const compactReminderStatus = message => {
  if (message === Lang.t('reminderUnavailableMessage')) { return Lang.t('reminderUnavailableShortMessage'); }
  if (message === Lang.t('notificationPermissionDeniedMessage')) { return Lang.t('notificationPermissionDeniedShortMessage'); }
  if (message === Lang.t('reminderSetMessage')) { return Lang.t('reminderSetShortMessage'); }

  return message;
};

export function NextSchedulePane({ navigation, origin, destination, segmentsList, holidaysList, onReplaceRoute, forcePreviewData = false }) {
    return (
      <NextScheduleContent
        navigation={navigation}
        route={{ params: { origin, destination, segmentsList, holidaysList } }}
        embedded
        forcePreviewData={forcePreviewData}
        onReplaceRoute={onReplaceRoute}
      />
    );
}

export default function NextSchedule({ navigation, route }) {
    return <NextScheduleContent navigation={navigation} route={route} />;
}

function NextScheduleContent({ navigation, route, embedded = false, forcePreviewData = false, onReplaceRoute }) {
    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const previewMode = getUIPreviewMode();
    const watchLayout = responsive.isWatch || isWatchUIPreview();
    const showInScreenBack = false;
    const screenDimensions = Dimensions.get('screen');
    const watchScreenShortestSide = watchLayout
      ? Math.max(responsive.shortestSide, Math.min(screenDimensions.width, screenDimensions.height))
      : responsive.shortestSide;
    const watchReminderButtonWidth = watchLayout ? Math.round(responsive.roundSafeWidth * 0.78) : undefined;
    const phoneActionButtonCompact = !watchLayout && responsive.isCompact;
    const tabletActionButton = !watchLayout && (embedded || responsive.isTablet);
    const watchScrollHintIsRounded = watchLayout && Math.abs(screenDimensions.width - screenDimensions.height) <= 32;
    const watchHeaderTextWidth = watchLayout
      ? Math.round(responsive.roundSafeWidth * (watchScrollHintIsRounded ? 0.66 : 0.84))
      : undefined;
    const watchScheduleEndPadding = watchLayout ? Math.round(watchScreenShortestSide * 0.34) : 0;

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
    const [ routeStatus,             setRouteStatus             ] = useState();
    const [ reminderStatus,          setReminderStatus          ] = useState();
    const [ isReminderActive,        setIsReminderActive        ] = useState(false);
    const [ isWatchScrollHintDismissed, setIsWatchScrollHintDismissed ] = useState(false);
    const [ watchScrollHintFullScrollCount, setWatchScrollHintFullScrollCount ] = useState(null);

    const nextTripViewOpacity = useRef(new Animated.Value(0)).current;
    const scrollHintProgress = useRef(new Animated.Value(0)).current;
    const watchFullScrollRecordLockedRef = useRef(false);
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

    const refreshReminderState = async () => {
      setIsReminderActive(Boolean(await Preferences.getReminderNotificationId(origin, destination)));
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

    const buildRemainingTimeMessage = (departure = nextTripTime) => {
      if (!departure) { return Lang.t('hurryUpMessage'); }

      let remainingTime = dayjs.duration( departure.diff() );
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
      if (!remainingTimeMessage.trim()) { return Lang.t('hurryUpMessage'); }

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
          if (nextOptions.length === 1) {
            setNextTripTime(comparedDate);
            setRemainingTimeMessage(buildRemainingTimeMessage(comparedDate));
          }
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
      setRouteStatus(nowFavorite ? Lang.t('routeSavedMessage') : Lang.t('routeRemovedMessage'));
    };

    const reverseRoute = () => {
      const nextRoute = {
        origin:       destination,
        destination:  origin,
        segmentsList: route.params.segmentsList,
        holidaysList: route.params.holidaysList
      };

      if (onReplaceRoute) {
        onReplaceRoute(nextRoute);
        return;
      }

      navigation.replace('NextSchedule', {
        ...nextRoute
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

    const cancelDepartureReminder = async () => {
      if (fallbackReminderRef.current) {
        clearTimeout(fallbackReminderRef.current);
        fallbackReminderRef.current = undefined;
      }

      const result = await Reminders.cancelDepartureReminder({ origin, destination });
      setIsReminderActive(false);
      setReminderStatus(result.message);
    };

    const setDepartureReminder = async () => {
      if (isReminderActive) {
        await cancelDepartureReminder();
        return;
      }

      if (!nextTripTime) { return; }
      const result = await Reminders.scheduleDepartureReminder({ origin, destination, departureTime: nextTripTime });
      if (!result.ok && result.reason === 'unavailable' && setForegroundFallbackReminder()) {
        setIsReminderActive(true);
        setReminderStatus(Lang.t('reminderSetMessage'));
        return;
      }
      setIsReminderActive(result.ok);
      setReminderStatus(result.message);
    };

    useEffect(() => {
      refreshFavoriteState();
      refreshReminderState();

      if (forcePreviewData || previewMode === 'schedule' || previewMode === 'watch' || previewMode === 'watch-schedule') {
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
      let wasCancelled = false;

      if (!watchLayout) { return; }

      Preferences.getScheduleScrollHintFullScrollCount()
        .then(count => {
          if (wasCancelled) { return; }
          setWatchScrollHintFullScrollCount(count);
        });

      return () => { wasCancelled = true; };
    }, [ watchLayout ]);

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

    useEffect(() => {
      if (!watchLayout || nextDepartures.length <= 1 || isWatchScrollHintDismissed) {
        scrollHintProgress.stopAnimation();
        scrollHintProgress.setValue(0);
        return;
      }

      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scrollHintProgress, {
            toValue: 1,
            duration: 1100,
            useNativeDriver: true
          }),
          Animated.timing(scrollHintProgress, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true
          }),
          Animated.delay(650)
        ])
      );

      animation.start();

      return () => animation.stop();
    }, [ watchLayout, nextDepartures.length, scrollHintProgress, isWatchScrollHintDismissed ]);

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

    const reminderButtonLabel = isReminderActive
      ? (watchLayout ? Lang.t('reminderSetShortMessage') : Lang.t('cancelReminderBtnLabel'))
      : (watchLayout ? Lang.t('remindMeShortBtnLabel') : Lang.t('remindMeBtnLabel'));
    const reminderButtonIcon = isReminderActive ? 'check' : (watchLayout ? 'checkbox-blank-outline' : 'bell-outline');
    const reminderButton = tabletActionButton ? (
      <Pressable
        onPress={setDepartureReminder}
        accessibilityRole="button"
        accessibilityLabel={isReminderActive ? Lang.t('cancelReminderBtnLabel') : Lang.t('remindMeBtnLabel')}
        accessibilityState={{ selected: isReminderActive }}
        style={({ pressed }) => [
          styles.actionButton,
          styles.reminderActionButton,
          styles.tabletReminderButton,
          {
            backgroundColor: theme.paperTheme.colors.secondaryContainer,
            opacity: pressed ? 0.72 : 1
          }
        ]}
      >
        <View style={styles.tabletReminderButtonContent}>
          <MaterialCommunityIcons
            name={reminderButtonIcon}
            size={24}
            color={theme.paperTheme.colors.onSecondaryContainer || theme.accentStrong}
            style={styles.tabletReminderButtonIcon}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.tabletReminderButtonLabel,
              { color: theme.paperTheme.colors.onSecondaryContainer || theme.accentStrong }
            ]}
          >
            {reminderButtonLabel}
          </Text>
        </View>
      </Pressable>
    ) : (
      <Button
        mode={watchLayout && isReminderActive ? 'contained' : 'contained-tonal'}
        icon={reminderButtonIcon}
        onPress={setDepartureReminder}
        compact={watchLayout || phoneActionButtonCompact}
        accessibilityLabel={isReminderActive ? Lang.t('cancelReminderBtnLabel') : Lang.t('remindMeBtnLabel')}
        style={watchLayout
          ? [ styles.reminderButtonWatch, { width: watchReminderButtonWidth } ]
          : [ styles.actionButton, styles.reminderActionButton ]}
        contentStyle={watchLayout
          ? styles.reminderButtonContentWatch
          : styles.actionButtonContent}
        labelStyle={watchLayout
          ? styles.reminderButtonLabelWatch
          : styles.actionButtonLabel}
      >
        {reminderButtonLabel}
      </Button>
    );
    const isReminderCancellationStatus = reminderStatus === Lang.t('reminderCanceledMessage');
    const watchReminderFeedback = reminderStatus && !isReminderActive && !isReminderCancellationStatus ? (
      <View style={[ styles.watchReminderFeedback, { backgroundColor: theme.accentSoft, width: watchReminderButtonWidth } ]}>
        <Text numberOfLines={2} style={[ styles.watchReminderFeedbackText, { color: theme.accentStrong } ]}>
          {compactReminderStatus(reminderStatus)}
        </Text>
      </View>
    ) : null;
    const watchReminderSwitch = (
      <View
        style={[
          styles.watchReminderSwitchRow,
          {
            width: watchReminderButtonWidth,
            backgroundColor: isReminderActive ? theme.accentSoft : theme.paperTheme.colors.surfaceVariant
          }
        ]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          ellipsizeMode="clip"
          style={[
            styles.watchReminderSwitchLabel,
            { color: isReminderActive ? theme.accentStrong : theme.paperTheme.colors.onSurfaceVariant }
          ]}
        >
          {isReminderActive ? Lang.t('reminderSetShortMessage') : Lang.t('remindMeShortBtnLabel')}
        </Text>
        <Switch
          value={isReminderActive}
          onValueChange={setDepartureReminder}
          color={theme.accent}
          accessibilityLabel={isReminderActive ? Lang.t('cancelReminderBtnLabel') : Lang.t('remindMeBtnLabel')}
        />
      </View>
    );
    const visibleRemainingTimeMessage = String(remainingTimeMessage || '').trim() || buildRemainingTimeMessage(nextTripTime);
    const watchRemainingTimeFontSize = watchLayout
      ? getWatchRemainingTimeFontSize(visibleRemainingTimeMessage, watchScreenShortestSide)
      : undefined;

    const watchRouteActions = watchLayout ? (
      <WatchScaleItem>
        <View style={styles.watchRouteActions}>
          <Pressable
            onPress={toggleFavorite}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? Lang.t('removeFavoriteBtnLabel') : Lang.t('addFavoriteBtnLabel')}
            accessibilityState={{ selected: isFavorite }}
            style={({ pressed }) => [
              styles.watchRouteActionButton,
              {
                backgroundColor: isFavorite ? theme.accentSoft : theme.paperTheme.colors.surfaceVariant,
                opacity: pressed ? 0.72 : 1
              }
            ]}
          >
            <Text style={[ styles.watchRouteActionIcon, { color: isFavorite ? theme.accentStrong : theme.paperTheme.colors.onSurfaceVariant } ]}>{isFavorite ? '★' : '☆'}</Text>
          </Pressable>
          <Pressable
            onPress={reverseRoute}
            accessibilityRole="button"
            accessibilityLabel={Lang.t('reverseRouteBtnLabel')}
            style={({ pressed }) => [
              styles.watchReverseButton,
              {
                backgroundColor: theme.paperTheme.colors.surfaceVariant,
                opacity: pressed ? 0.72 : 1
              }
            ]}
          >
            <Text numberOfLines={1} style={[ styles.watchReverseText, { color: theme.paperTheme.colors.onSurfaceVariant } ]}>⇄ {Lang.t('reverseRouteBtnLabel')}</Text>
          </Pressable>
        </View>
      </WatchScaleItem>
    ) : null;

    const departuresList = nextDepartures.length > 1 ? (
      watchLayout ? (
        <WatchScaleItem>
          <TransitCard style={styles.nextDeparturesWatchCard}>
            <Text variant="labelLarge" style={styles.sectionTitleWatch}>{Lang.t('nextDeparturesTitle')}</Text>
            {nextDepartures.map((departure, index) => (
              <View key={departure.toISOString()} style={styles.departureRowWatch}>
                <Text style={styles.departureTimeWatch}>{departure.format('HH:mm')}</Text>
                <Text numberOfLines={1} style={styles.departureDeltaWatch}>{index === 0 ? sourceLabel(scheduleSource) : formatDepartureDelta(departure)}</Text>
              </View>
            ))}
          </TransitCard>
        </WatchScaleItem>
      ) : (
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
      )
    ) : null;

    const watchScrollHintOpacity = scrollHintProgress.interpolate({
      inputRange: [ 0, 0.2, 0.78, 1 ],
      outputRange: [ 0, 0.72, 0.72, 0 ]
    });
    const shouldShowWatchScrollHint = watchLayout
      && nextDepartures.length > 1
      && !isWatchScrollHintDismissed
      && watchScrollHintFullScrollCount !== null
      && watchScrollHintFullScrollCount < SCHEDULE_SCROLL_HINT_FULL_SCROLL_LIMIT;
    const watchScrollHintTravel = Math.round(responsive.height * 0.16);
    const watchScrollHintTranslateY = scrollHintProgress.interpolate({
      inputRange: [ 0, 1 ],
      outputRange: [ watchScrollHintTravel, 0 ]
    });
    const watchScrollHintCounterTranslateY = scrollHintProgress.interpolate({
      inputRange: [ 0, 1 ],
      outputRange: [ -watchScrollHintTravel, 0 ]
    });
    const watchSideScrollHintTop = Math.round(responsive.height * 0.51);
    const watchSideScrollSegmentHeight = Math.round(responsive.height * 0.09);
    const watchSideScrollHint = shouldShowWatchScrollHint ? (
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.watchSideScrollHint,
          watchScrollHintIsRounded
            ? [
              styles.watchSideScrollHintRounded,
              {
                width: Math.round(responsive.width * 0.14),
                height: watchSideScrollSegmentHeight,
                top: watchSideScrollHintTop,
                transform: [ { translateY: watchScrollHintTranslateY } ]
              }
            ]
            : [
              styles.watchSideScrollHintSquare,
              {
                height: watchSideScrollSegmentHeight + watchScrollHintTravel,
                top: watchSideScrollHintTop
              }
            ]
        ]}
      >
        <Animated.View
          style={[
            watchScrollHintIsRounded ? styles.watchSideScrollArcRounded : styles.watchSideScrollArcSquare,
            {
              borderColor: theme.accentStrong,
              backgroundColor: watchScrollHintIsRounded ? 'transparent' : theme.accentStrong,
              opacity: watchScrollHintOpacity,
              ...(watchScrollHintIsRounded ? {
                width: responsive.width,
                height: responsive.height,
                borderRadius: responsive.shortestSide / 2,
                top: -watchSideScrollHintTop,
                transform: [ { translateY: watchScrollHintCounterTranslateY } ]
              } : {
                height: watchSideScrollSegmentHeight,
                transform: [ { translateY: watchScrollHintTranslateY } ]
              })
            }
          ]}
        />
      </Animated.View>
    ) : null;


    const handleScheduleScroll = async event => {
      if (!shouldShowWatchScrollHint || watchFullScrollRecordLockedRef.current) { return; }

      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const scrolledDistance = contentOffset?.y || 0;
      const viewportHeight = layoutMeasurement?.height || 0;
      const contentHeight = contentSize?.height || 0;
      const distanceFromBottom = contentHeight - (scrolledDistance + viewportHeight);

      if (scrolledDistance <= 8 || distanceFromBottom > 24) { return; }

      watchFullScrollRecordLockedRef.current = true;
      setIsWatchScrollHintDismissed(true);

      const nextCount = await Preferences.incrementScheduleScrollHintFullScrollCount();
      setWatchScrollHintFullScrollCount(nextCount);
    };


    return (
      <View style={styles.scheduleFrame}>
        <AppScreen
          contentWidth={embedded ? 'full' : 'normal'}
          contentStyle={[ styles.stackGap, watchLayout ? styles.stackGapWatch : undefined, embedded && !watchLayout ? styles.stackGapEmbedded : undefined ]}
          onScroll={watchLayout ? handleScheduleScroll : undefined}
          style={embedded ? styles.embeddedScreen : undefined}
        >
          <View style={[ styles.headerRow, watchLayout ? styles.headerRowWatch : undefined ]}>
            {showInScreenBack ? (
              <IconButton icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel={Lang.t('goBackBtnLabel')} />
            ) : !watchLayout ? (
              <IconButton
                icon="swap-horizontal"
                onPress={reverseRoute}
                accessibilityLabel={Lang.t('reverseRouteBtnLabel')}
                style={styles.headerActionSlot}
              />
            ) : null}
            <View style={[ styles.headerText, watchLayout ? [ styles.headerTextWatch, { width: watchHeaderTextWidth } ] : undefined ]}>
              <Text
                variant={watchLayout ? 'titleMedium' : 'titleLarge'}
                style={[ styles.routeTitle, watchLayout ? styles.routeTitleWatch : undefined ]}
                numberOfLines={watchLayout ? 1 : 2}
                adjustsFontSizeToFit={watchLayout}
                minimumFontScale={0.58}
                ellipsizeMode="clip"
              >
                {origin.title}
              </Text>
              <Text
                variant={watchLayout ? 'bodySmall' : 'bodyMedium'}
                style={[ styles.routeSubtitle, watchLayout ? styles.routeSubtitleWatch : undefined ]}
                numberOfLines={watchLayout ? 1 : 2}
                adjustsFontSizeToFit={watchLayout}
                minimumFontScale={0.62}
                ellipsizeMode="clip"
              >
                → {destination.title}
              </Text>
            </View>
            {!watchLayout ? <IconButton icon={isFavorite ? 'star' : 'star-outline'} onPress={toggleFavorite} accessibilityLabel={isFavorite ? Lang.t('removeFavoriteBtnLabel') : Lang.t('addFavoriteBtnLabel')} /> : null}
          </View>

          <WatchScaleItem>
            <TransitCard style={[ styles.departureBoard, watchLayout ? styles.departureBoardWatch : undefined ]}>
              {!watchLayout ? <View style={styles.boardTopRow}>
                <StatusPill tone={sourceTone(scheduleSource)}>{sourceLabel(scheduleSource)}</StatusPill>
                <OfflineModeHint isOffline={networkErrorDetected} sourceLabel={sourceLabel(scheduleSource)} navigation={navigation} />
              </View> : null}
              {!watchLayout ? <Text variant="labelLarge" style={styles.boardLabel}>{Lang.t('nextTripScheduleForMessage')}</Text> : null}
              <Animated.View style={{ opacity: shouldLoopAnimation ? nextTripViewOpacity : 1 }}>
                <Text variant={watchLayout ? 'displayMedium' : 'displayLarge'} style={[ styles.heroTime, watchLayout ? styles.heroTimeWatch : undefined ]} accessibilityLabel={`${sourceLabel(scheduleSource)} ${nextTripTime.format('HH:mm')}`}>
                  {nextTripTime.format('HH:mm')}
                </Text>
              </Animated.View>
              {watchLayout ? (
                <>
                  <Text
                    variant="titleMedium"
                    numberOfLines={watchLayout ? 2 : 1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.58}
                    ellipsizeMode="clip"
                    style={[
                      styles.remainingTextWatch,
                      {
                        fontSize: watchRemainingTimeFontSize,
                        lineHeight: watchRemainingTimeFontSize + 4
                      }
                    ]}
                  >
                    {visibleRemainingTimeMessage}
                  </Text>
                  <Text variant="labelSmall" style={styles.sourceTextWatch}>{sourceLabel(scheduleSource)}</Text>
                  <OfflineModeHint isOffline={networkErrorDetected} sourceLabel={sourceLabel(scheduleSource)} navigation={navigation} />
                </>
              ) : (
                <StatusPill icon="clock-outline" tone="accent" style={styles.remainingPill}>{visibleRemainingTimeMessage}</StatusPill>
              )}
            </TransitCard>
          </WatchScaleItem>

          {watchRouteActions}

          <WatchScaleItem>
            <View style={[ styles.actions, watchLayout ? styles.actionsWatch : undefined ]}>
              {watchLayout ? (
                <View style={styles.watchReminderButtonFrame}>
                  {watchReminderFeedback || watchReminderSwitch}
                </View>
              ) : reminderButton}
            </View>
          </WatchScaleItem>

          {routeStatus ? (
            watchLayout ? (
              <WatchScaleItem>
                <StatusPill tone="accent" style={styles.statusMessage}>{routeStatus}</StatusPill>
              </WatchScaleItem>
            ) : (
              <StatusPill tone="accent" style={styles.statusMessage}>{routeStatus}</StatusPill>
            )
          ) : null}

          {departuresList}

          {reminderStatus ? (
            watchLayout ? (
              <WatchScaleItem>
                <StatusPill tone="accent" style={styles.statusMessage}>{compactReminderStatus(reminderStatus)}</StatusPill>
              </WatchScaleItem>
            ) : (
              <StatusPill tone="accent" style={styles.statusMessage}>{reminderStatus}</StatusPill>
            )
          ) : null}

          {shouldLoopAnimation ? (
            watchLayout ? (
              <WatchScaleItem>
                <RNActivityIndicator color={theme.accent} style={styles.haTimeLoaderWatch} />
              </WatchScaleItem>
            ) : (
              <RNActivityIndicator color={theme.accent} style={styles.haTimeLoader} />
            )
          ) : null}

          {watchLayout ? <View style={{ height: watchScheduleEndPadding }} /> : null}
        </AppScreen>
        {watchSideScrollHint}
      </View>
    );
}

const styles = StyleSheet.create({
  scheduleFrame: {
    flex: 1
  },
  embeddedScreen: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0
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
    gap: 12
  },
  stackGapEmbedded: {
    gap: 10
  },
  stackGapWatch: {
    gap: 5,
    justifyContent: 'flex-start',
    paddingTop: 2
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  headerRowWatch: {
    justifyContent: 'center',
    minHeight: 38,
    marginTop: 8,
    marginBottom: 0
  },
  headerActionSlot: {
    width: 48,
    height: 48
  },
  headerText: {
    flex: 1,
    alignItems: 'center'
  },
  headerTextWatch: {
    flex: 0,
    alignSelf: 'center'
  },
  routeTitle: {
    fontWeight: '900',
    textAlign: 'center'
  },
  routeTitleWatch: {
    width: '100%',
    fontWeight: '900',
    fontSize: 16,
    lineHeight: 20,
    includeFontPadding: false
  },
  routeSubtitle: {
    textAlign: 'center'
  },
  routeSubtitleWatch: {
    width: '100%',
    opacity: 0.78,
    fontSize: 12,
    lineHeight: 15,
    includeFontPadding: false
  },
  departureBoard: {
    alignItems: 'stretch'
  },
  departureBoardWatch: {
    width: '88%',
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 2
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
  heroTimeWatch: {
    fontSize: 42,
    lineHeight: 46,
    marginTop: -1,
    marginBottom: -1,
    includeFontPadding: false
  },
  remainingPill: {
    alignSelf: 'center'
  },
  remainingTextWatch: {
    width: '100%',
    maxWidth: '92%',
    textAlign: 'center',
    fontWeight: '800',
    marginTop: 0,
    includeFontPadding: false
  },
  sourceTextWatch: {
    textAlign: 'center',
    opacity: 0.62,
    marginTop: 0,
    fontSize: 11,
    lineHeight: 13
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
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 8
  },
  actionButton: {
    flexShrink: 1,
    alignSelf: 'stretch'
  },
  reminderActionButton: {
    width: '100%'
  },
  actionButtonContent: {
    minHeight: 48,
    paddingHorizontal: 8,
    justifyContent: 'center'
  },
  actionButtonLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginHorizontal: 6
  },
  tabletReminderButton: {
    borderRadius: 28,
    minHeight: 64,
    justifyContent: 'center'
  },
  tabletReminderButtonContent: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  tabletReminderButtonIcon: {
    flexShrink: 0
  },
  tabletReminderButtonLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800'
  },
  actionsWatch: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    marginTop: 0,
    overflow: 'visible'
  },
  watchRouteActions: {
    width: '82%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 2,
    marginBottom: 2
  },
  watchRouteActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  watchRouteActionIcon: {
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '800'
  },
  watchReverseButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  watchReverseText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'center'
  },
  nextDeparturesWatchCard: {
    width: '78%',
    alignSelf: 'center',
    paddingTop: 2,
    marginTop: 4
  },
  sectionTitleWatch: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    marginBottom: 1
  },
  departureRowWatch: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    marginTop: 3
  },
  departureTimeWatch: {
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900'
  },
  departureDeltaWatch: {
    width: '100%',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 13,
    opacity: 0.72,
    fontWeight: '700'
  },
  watchReminderButtonFrame: {
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible'
  },
  reminderButtonWatch: {
    borderRadius: 22,
    alignSelf: 'center'
  },
  reminderButtonContentWatch: {
    minHeight: 36,
    height: 36,
    paddingHorizontal: 8
  },
  reminderButtonLabelWatch: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '800',
    marginVertical: 0,
    marginHorizontal: 0
  },
  watchReminderFeedback: {
    width: '100%',
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  watchReminderFeedbackText: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '800'
  },
  watchReminderSwitchRow: {
    minHeight: 40,
    borderRadius: 20,
    paddingLeft: 14,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4
  },
  watchReminderSwitchLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '800',
    includeFontPadding: false
  },
  watchSideScrollHint: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
    overflow: 'hidden'
  },
  watchSideScrollHintRounded: {
    right: 0
  },
  watchSideScrollHintSquare: {
    right: 14,
    width: 3
  },
  watchSideScrollArcRounded: {
    position: 'absolute',
    right: 0,
    borderRightWidth: 3
  },
  watchSideScrollArcSquare: {
    width: 3,
    borderRadius: 2
  },
  statusMessage: {
    alignSelf: 'center'
  },
  haTimeLoader: {
    position: 'absolute',
    top: 16,
    right: 16
  },
  haTimeLoaderWatch: {
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 2
  }
});

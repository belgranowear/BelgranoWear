import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  Animated,
  AppState,
  Dimensions,
  Pressable,
  StyleSheet,
  Vibration,
  View
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';

import dayjs                  from 'dayjs';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import {
  Button,
  Text
} from 'react-native-paper';

import Lang         from '../includes/Lang';
import LiveTrip     from '../includes/LiveTrip';
import Preferences  from '../includes/Preferences';
import Reminders    from '../includes/Reminders';
import TripSnapshot from '../includes/TripSnapshot';
import {
  DEFAULT_SEGMENTS_LIST,
  SOURCE,
  atArgentinaWallTime,
  buildTrips,
  fetchLiveRows,
  fetchLiveStationsList,
  fetchScheduleOptions as fetchRouteScheduleOptions,
  findLiveStationIndex,
  findTargetSegmentId,
  isSameArgentinaDay,
  pickLiveDeparture
} from '../includes/Schedule';
import { nowInArgentina } from '../includes/Time';
import { getUIPreviewMode, isWatchUIPreview } from '../includes/UIPreview';
import { isRoundScreen } from '../includes/Device';
import { useTheme } from '../includes/Theme';

import FreshnessChip    from './FreshnessChip';
import RouteHeader      from './RouteHeader';
import WalkEstimateCard from './WalkEstimateCard';
import CurvedText       from './watch/CurvedText';
import EdgeButton, * as EdgeButtonModule from './watch/EdgeButton';
import { AppScreen, MessageScreen, StatusPill, TransitCard, WatchScaleItem, useResponsiveMetrics } from './ui';
import LazyMenu from './layout/LazyMenu';
import LoadingIndicator from './layout/LoadingIndicator';

const SCHEDULE_SCROLL_HINT_FULL_SCROLL_LIMIT = 3;

// The watch EdgeButton reports the bottom space it covers; older builds of the primitive don't export the hook.
const useEdgeButtonMetrics = EdgeButtonModule.useEdgeButtonMetrics || (() => ({ reservedSpace: 0 }));

// Kept in state (and published to native surfaces); each layout shows a slice of it.
const SNAPSHOT_DEPARTURES_COUNT = 5;
const VISIBLE_DEPARTURES_COUNT  = { regular: 5, short: 3, watch: 3 };

const DEPARTURE_LOOKAHEAD_DAYS    = 7;
const DEPARTURE_VIBRATION_PATTERN = [ 0, 400, 150, 400 ];

const REMINDER_LEAD_OPTIONS            = [ 5, 10, 15 ];
const DEFAULT_REMINDER_LEAD_MINUTES    = 5;
const REMINDER_RESCHEDULE_THRESHOLD_MS = 60 * 1000;

// Below this many ms the hero reads "Sale ahora" instead of "en 1 min".
const DEPARTING_NOW_THRESHOLD_MS = 45 * 1000;

// Layout breakpoints measured on the screen's own content width (works for the embedded tablet pane too).
const SINGLE_COLUMN_MAX_WIDTH      = 620;
const SHORT_HEIGHT_TWO_COLUMNS_MIN = 560;
const EXPANDED_TWO_COLUMNS_MIN     = 880;
const NARROW_TABLE_MAX_WIDTH       = 420;

const sourceLabel = source => ({
  [SOURCE.LIVE]:      Lang.t('sourceLiveEstimate'),
  [SOURCE.SCHEDULED]: Lang.t('sourceScheduledTime'),
  [SOURCE.OFFLINE]:   Lang.t('sourceOfflineCached')
}[source] || Lang.t('sourceScheduledTime'));

const sourceShortLabel = source => ({
  [SOURCE.LIVE]:      Lang.t('sourceLiveShort'),
  [SOURCE.SCHEDULED]: Lang.t('sourceScheduledShort'),
  [SOURCE.OFFLINE]:   Lang.t('sourceOfflineShort')
}[source] || Lang.t('sourceScheduledShort'));

// "13 min", "1 h 49 min", "2 d 3 h": one short line, never wraps.
const formatWaitDuration = totalMinutes => {
  const days    = Math.floor(totalMinutes / 1440);
  const hours   = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) { return hours > 0 ? Lang.t('waitShortDaysHours', { days, hours }) : Lang.t('waitShortDays', { days }); }
  if (hours > 0) { return minutes > 0 ? Lang.t('waitShortHoursMinutes', { hours, minutes }) : Lang.t('waitShortHours', { hours }); }

  return Lang.t('waitShortMinutes', { minutes });
};

// "en 13 min" (no parentheses) or "Sale ahora".
const formatWait = departure => {
  if (!departure) { return ''; }

  const remainingMs = departure.diff();

  if (remainingMs < DEPARTING_NOW_THRESHOLD_MS) { return Lang.t('departingNowMessage'); }

  return Lang.t('waitInMessage', { duration: formatWaitDuration(Math.max(1, Math.ceil(remainingMs / 60000))) });
};

const compactReminderStatus = status => status.shortMessage || status.message;

const toMillis = value => {
  if (value === null || typeof(value) === 'undefined') { return NaN; }
  if (typeof(value) === 'number') { return value; }

  return typeof(value.valueOf) === 'function' ? Number(value.valueOf()) : NaN;
};

const publishTripSnapshot = snapshot => {
  try {
    Promise.resolve(TripSnapshot.publish(snapshot)).catch(exception => {
      console.warn('NextSchedule: couldn\'t publish the trip snapshot:', exception);
    });
  } catch (exception) {
    console.warn('NextSchedule: couldn\'t publish the trip snapshot:', exception);
  }
};

const isLiveTripAvailable = () => {
  try {
    return Boolean(LiveTrip.isAvailable());
  } catch (exception) {
    return false;
  }
};

const isSameRoute = (trip, origin, destination) => Boolean(trip)
  && String(trip.origin?.id) === String(origin.id)
  && String(trip.destination?.id) === String(destination.id);

export function NextSchedulePane({ navigation, origin, destination, segmentsList, holidaysList, onReplaceRoute, onFavoriteChange, favoritesVersion, forcePreviewData = false }) {
    return (
      <NextScheduleContent
        navigation={navigation}
        route={{ params: { origin, destination, segmentsList, holidaysList } }}
        embedded
        forcePreviewData={forcePreviewData}
        onReplaceRoute={onReplaceRoute}
        onFavoriteChange={onFavoriteChange}
        favoritesVersion={favoritesVersion}
      />
    );
}

export default function NextSchedule({ navigation, route }) {
    return <NextScheduleContent navigation={navigation} route={route} />;
}

function NextScheduleContent({ navigation, route, embedded = false, forcePreviewData = false, onReplaceRoute, onFavoriteChange, favoritesVersion }) {
    const { theme }   = useTheme();
    const responsive  = useResponsiveMetrics();
    const edgeButton  = useEdgeButtonMetrics();
    const previewMode = getUIPreviewMode();
    const watchLayout = responsive.isWatch || isWatchUIPreview();

    // `isShortHeight` / `isExpanded` come from the shell metrics; fall back to the window size.
    const { isShortHeight: metricsShortHeight, isExpanded: metricsExpanded } = responsive;
    const isShortHeight = !watchLayout && (typeof(metricsShortHeight) === 'boolean' ? metricsShortHeight : responsive.height <= 480);
    const isExpanded    = !watchLayout && (typeof(metricsExpanded) === 'boolean' ? metricsExpanded : responsive.width >= 840);

    const screenDimensions        = Dimensions.get('screen');
    const watchScreenShortestSide = watchLayout
      ? Math.max(responsive.shortestSide, Math.min(screenDimensions.width, screenDimensions.height))
      : responsive.shortestSide;
    const watchIsRound            = isRoundScreen({ width: screenDimensions.width, height: screenDimensions.height, watch: watchLayout });
    const watchScrollHintIsRounded = watchIsRound;
    // Widths that stay inside the circle on round faces (192 dp is the design baseline).
    const watchHeaderTextWidth    = watchLayout ? Math.round(watchScreenShortestSide * (watchIsRound ? 0.7 : 0.88)) : undefined;
    const watchListWidth          = watchLayout ? Math.round(watchScreenShortestSide * (watchIsRound ? 0.8 : 0.9)) : undefined;
    const watchActionsWidth       = watchLayout ? Math.round(watchScreenShortestSide * (watchIsRound ? 0.72 : 0.9)) : undefined;
    const watchTopBand            = watchLayout ? Math.round(watchScreenShortestSide * 0.13) : 0;
    const watchScheduleEndPadding = watchLayout ? Math.max(Math.round(watchScreenShortestSide * 0.42), Math.round((edgeButton?.reservedSpace || 0) + 12)) : 0;
    const watchTimeFontSize       = watchLayout ? Math.round(Math.max(38, Math.min(50, watchScreenShortestSide * 0.22))) : undefined;
    const watchWaitFontSize       = watchLayout ? Math.round(Math.max(17, Math.min(22, watchScreenShortestSide * 0.1))) : undefined;

    const [ crashMessage,            setCrashMessage            ] = useState();
    const [ remainingTimeMillis,     setRemainingTimeMillis     ] = useState();
    const [ nextTripTime,            setNextTripTime            ] = useState();
    const [ nextDepartures,          setNextDepartures          ] = useState([]);
    const [ dataFetchedAt,           setDataFetchedAt           ] = useState();
    const [ networkErrorDetected,    setNetworkErrorDetected    ] = useState();
    const [ currentOperation,        setCurrentOperation        ] = useState(Lang.t('fetchingNextTripTimeMessage') + '…');
    const [ isNextTripFadedIn,       setIsNextTripFadedIn       ] = useState(false);
    const [ shouldLoopAnimation,     setShouldLoopAnimation     ] = useState(true);
    const [ scheduleSource,          setScheduleSource          ] = useState(SOURCE.SCHEDULED);
    const [ isFavorite,              setIsFavorite              ] = useState(false);
    const [ routeStatus,             setRouteStatus             ] = useState();
    const [ reminderStatus,          setReminderStatus          ] = useState();
    const [ isReminderActive,        setIsReminderActive        ] = useState(false);
    const [ isReminderBusy,          setIsReminderBusy          ] = useState(false);
    const [ reminderLeadMinutes,     setReminderLeadMinutes     ] = useState(DEFAULT_REMINDER_LEAD_MINUTES);
    const [ activeReminderLead,      setActiveReminderLead      ] = useState(DEFAULT_REMINDER_LEAD_MINUTES);
    const [ isLeadMenuVisible,       setIsLeadMenuVisible       ] = useState(false);
    const [ isTracking,              setIsTracking              ] = useState(false);
    const [ isTrackingBusy,          setIsTrackingBusy          ] = useState(false);
    const [ layoutWidth,             setLayoutWidth             ] = useState(0);
    const [ isWatchScrollHintDismissed, setIsWatchScrollHintDismissed ] = useState(false);
    const [ watchScrollHintFullScrollCount, setWatchScrollHintFullScrollCount ] = useState(null);

    const nextTripViewOpacity            = useRef(new Animated.Value(0)).current;
    const scrollHintProgress             = useRef(new Animated.Value(0)).current;
    const watchFullScrollRecordLockedRef = useRef(false);
    const fallbackReminderRef            = useRef();
    const reminderBusyRef                = useRef(false);
    const reminderDepartureRef           = useRef();
    const activeReminderLeadRef          = useRef(DEFAULT_REMINDER_LEAD_MINUTES);
    const reminderRouteKeyRef            = useRef();
    const upcomingDeparturesRef          = useRef([]);
    const arrivalByDepartureRef          = useRef({});
    const liveEstimateRef                = useRef(null);
    const baseScheduleSourceRef          = useRef(SOURCE.SCHEDULED);
    const scheduleRequestRef             = useRef(0);

    const origin      = route.params.origin;
    const destination = route.params.destination;
    const liveTripAvailable = isLiveTripAvailable();
    const isPreviewData     = Boolean(forcePreviewData || previewMode === 'schedule' || previewMode === 'watch' || previewMode === 'watch-schedule');

    reminderRouteKeyRef.current = `${origin.id}:${destination.id}`;

    const routeParams = {
      origin,
      destination,
      segmentsList: route.params.segmentsList,
      holidaysList: route.params.holidaysList
    };

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

    const setActiveLead = leadMinutes => {
      activeReminderLeadRef.current = leadMinutes;
      setActiveReminderLead(leadMinutes);
    };

    const refreshReminderState = async () => {
      const routeKey = reminderRouteKeyRef.current;
      clearForegroundFallbackReminder();
      reminderDepartureRef.current = undefined;
      setIsReminderActive(false);
      setReminderStatus(undefined);
      const reminder = await Reminders.getActiveReminder({ origin, destination });
      if (routeKey !== reminderRouteKeyRef.current || reminderBusyRef.current) { return; }
      reminderDepartureRef.current = reminder ? reminder.departureAt : undefined;
      if (reminder && Number.isFinite(reminder.leadMinutes)) { setActiveLead(reminder.leadMinutes); }
      setIsReminderActive(Boolean(reminder));
    };

    const refreshTrackingState = async () => {
      if (!liveTripAvailable) { return; }

      try {
        const activeTrip = await LiveTrip.getActive();
        setIsTracking(isSameRoute(activeTrip, origin, destination));
      } catch (exception) {
        console.warn('NextSchedule: couldn\'t read the tracked trip:', exception);
      }
    };

    const getEffectiveDepartures = () => {
      const departures   = upcomingDeparturesRef.current;
      const liveEstimate = liveEstimateRef.current;

      if (liveEstimate && departures.length > 0 && liveEstimate.scheduledAt === departures[0].valueOf()) {
        return [ liveEstimate.departure, ...departures.slice(1) ];
      }

      return departures;
    };

    // Scheduled arrival of a departure; a live departure shifts its scheduled arrival by the same delay.
    const getArrivalFor = departure => {
      if (!departure) { return null; }

      const arrivals = arrivalByDepartureRef.current;
      const direct   = arrivals[departure.valueOf()];

      if (direct) { return direct; }

      const liveEstimate = liveEstimateRef.current;

      if (liveEstimate && liveEstimate.departure === departure && arrivals[liveEstimate.scheduledAt]) {
        return arrivals[liveEstimate.scheduledAt].add(departure.valueOf() - liveEstimate.scheduledAt, 'millisecond');
      }

      return null;
    };

    const getDepartureSource = index => (index === 0 ? scheduleSource : (scheduleSource === SOURCE.LIVE ? baseScheduleSourceRef.current : scheduleSource));

    const showDepartures = (departures, source) => {
      setScheduleSource(source);
      setNextTripTime(departures[0]);
      setNextDepartures(departures.slice(0, SNAPSHOT_DEPARTURES_COUNT));
      setRemainingTimeMillis(departures[0] ? departures[0].diff() : undefined);
    };

    const isLiveEstimateApplicable = departure => Boolean(departure) && !previewMode && isSameArgentinaDay(departure, nowInArgentina());

    const fetchHighAccuracyRemainingTime = async (originName, destinationName) => {
      const scheduledDeparture = upcomingDeparturesRef.current[0];
      const followingDeparture = upcomingDeparturesRef.current[1];

      try {
        if (!isLiveEstimateApplicable(scheduledDeparture)) { return; }

        const liveStationsList = await fetchLiveStationsList();

        const originIndex      = findLiveStationIndex(liveStationsList, originName);
        const destinationIndex = findLiveStationIndex(liveStationsList, destinationName);

        if (originIndex < 0 || destinationIndex < 0 || originIndex === destinationIndex) { return; }

        const rows = await fetchLiveRows(liveStationsList, originIndex, destinationIndex);

        // Discard results for a departure that is no longer the next one (advanced, retried or unmounted).
        if (upcomingDeparturesRef.current[0] !== scheduledDeparture) { return; }

        const liveDeparture = pickLiveDeparture({
          rows,
          liveStationsList,
          originIndex,
          destinationIndex,
          scheduledDeparture,
          followingDeparture,
          now: nowInArgentina()
        });

        if (!liveDeparture) { return; }

        liveEstimateRef.current = { scheduledAt: scheduledDeparture.valueOf(), departure: liveDeparture };
        setDataFetchedAt(Date.now());
        showDepartures(getEffectiveDepartures(), SOURCE.LIVE);
      } catch (exception) {
        console.warn('Couldn\'t fetch live tracking data:', exception);
      } finally {
        setShouldLoopAnimation(false);
      }
    };

    const getTargetSegment = (dayjsInstance = nowInArgentina()) => findTargetSegmentId(
      dayjsInstance,
      route.params.segmentsList || DEFAULT_SEGMENTS_LIST,
      route.params.holidaysList
    );

    const processScheduleOptions = (trips, originName, destinationName, source = SOURCE.SCHEDULED) => {
      setCurrentOperation( Lang.t('processingScheduleMessage') + '…' );

      const departures = trips.map(trip => trip.departure);
      const arrivals   = {};

      trips.forEach(trip => { if (trip.arrival) { arrivals[trip.departure.valueOf()] = trip.arrival; } });

      upcomingDeparturesRef.current = departures;
      arrivalByDepartureRef.current = arrivals;
      liveEstimateRef.current       = null;
      baseScheduleSourceRef.current = source;

      // Offline data comes from the cache, whose age isn't known here.
      setDataFetchedAt(source === SOURCE.OFFLINE ? undefined : Date.now());
      showDepartures(departures, source);

      if (isLiveEstimateApplicable(departures[0])) { fetchHighAccuracyRemainingTime(originName, destinationName); }
      else { setShouldLoopAnimation(false); }
    };

    const fetchScheduleOptions = segment => fetchRouteScheduleOptions(segment, route.params.origin.id, route.params.destination.id);

    const fetchNextTripTime = async (originName, destinationName) => {
      const requestId        = ++scheduleRequestRef.current;
      const now              = nowInArgentina();
      const optionsBySegment = {};
      let hasTargetSegment   = false;

      setCurrentOperation( Lang.t('fetchingNextTripTimeMessage') + '…' );

      // Today first, then the following days until a departure is found.
      for (let dayOffset = 0; dayOffset <= DEPARTURE_LOOKAHEAD_DAYS; dayOffset++) {
        let segment = getTargetSegment(atArgentinaWallTime(now, dayOffset, 12, 0));
        if (!segment) { continue; }

        hasTargetSegment = true;

        if (!(segment in optionsBySegment)) { optionsBySegment[segment] = await fetchScheduleOptions(segment); }
        if (requestId !== scheduleRequestRef.current) { return; }

        const result = optionsBySegment[segment];

        if (!result) {
          crash( Lang.t('fetchNextTripTimeError') );
          return;
        }

        const trips = buildTrips(now, dayOffset, result.options);

        if (trips.length > 0) {
          if (result.source === SOURCE.OFFLINE) { setNetworkErrorDetected(true); }
          processScheduleOptions(trips, originName, destinationName, result.source);
          return;
        }
      }

      setShouldLoopAnimation(false);
      crash( Lang.t(hasTargetSegment ? 'noTripsFoundMessage' : 'getTargetSegmentError') );
    };

    // Drops departed trains and moves on to the next one, looking up the schedule again when none are left.
    const advanceDepartures = ({ notifyDeparture = false, refreshLiveEstimate = false } = {}) => {
      const now                 = nowInArgentina();
      const effectiveDepartures = getEffectiveDepartures();
      const pendingIndexes      = effectiveDepartures
        .map((departure, index) => departure.valueOf() > now.valueOf() ? index : -1)
        .filter(index => index > -1);
      const hasDeparted         = pendingIndexes.length < effectiveDepartures.length;

      if (hasDeparted && notifyDeparture && AppState.currentState === 'active' && (navigation?.isFocused?.() ?? true)) {
        Vibration.vibrate(DEPARTURE_VIBRATION_PATTERN);
      }

      if (effectiveDepartures.length > 0 && pendingIndexes.length === 0) {
        upcomingDeparturesRef.current = [];
        liveEstimateRef.current       = null;
        setNextTripTime(undefined);
        setNextDepartures([]);
        fetchNextTripTime(origin.title, destination.title);
        return;
      }

      if (pendingIndexes.length === 0) { return; }

      if (hasDeparted) {
        upcomingDeparturesRef.current = pendingIndexes.map(index => upcomingDeparturesRef.current[index]);
        if (pendingIndexes[0] !== 0) { liveEstimateRef.current = null; }
      }

      const departures = getEffectiveDepartures();
      const source     = liveEstimateRef.current && departures[0] === liveEstimateRef.current.departure ? SOURCE.LIVE : baseScheduleSourceRef.current;

      showDepartures(departures, source);

      if ((hasDeparted || refreshLiveEstimate) && isLiveEstimateApplicable(upcomingDeparturesRef.current[0])) {
        fetchHighAccuracyRemainingTime(origin.title, destination.title);
      }
    };

    const retry = () => {
      upcomingDeparturesRef.current = [];
      liveEstimateRef.current       = null;
      setCrashMessage(undefined);
      setNextTripTime(undefined);
      setNextDepartures([]);
      setShouldLoopAnimation(true);
      fetchNextTripTime(origin.title, destination.title);
      fadeInNextTripTime();
    };

    const toggleFavorite = async () => {
      const shouldBeFavorite = !isFavorite;

      setIsFavorite(shouldBeFavorite);

      try {
        await Preferences.setFavoriteTrip(origin, destination, shouldBeFavorite);
        setRouteStatus(shouldBeFavorite ? Lang.t('routeSavedMessage') : Lang.t('routeRemovedMessage'));
      } catch (exception) {
        console.warn('toggleFavorite: couldn\'t update favorite trip:', exception);
        setRouteStatus(Lang.t('favoriteUpdateFailedMessage'));
      }

      await refreshFavoriteState();

      if (onFavoriteChange) { onFavoriteChange(); }
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

    const openFullSchedule = () => { navigation.navigate('FullSchedule', routeParams); };

    const openTripDetail = (departure = nextTripTime) => {
      navigation.navigate('TripDetail', { ...routeParams, departure: departure ? departure.valueOf() : undefined });
    };

    const openOfflineInfo = () => { navigation.navigate('OfflineModeInfo'); };

    // Web / Expo Go fallback: it only works while this screen stays mounted, and the UI says so.
    const setForegroundFallbackReminder = (departure = nextTripTime, leadMinutes = activeReminderLeadRef.current) => {
      const reminderDate = departure.subtract(leadMinutes, 'minute');
      const delayMs = reminderDate.diff();
      if (delayMs <= 0) { return false; }
      if (fallbackReminderRef.current) { clearTimeout(fallbackReminderRef.current); }
      fallbackReminderRef.current = setTimeout(() => {
        fallbackReminderRef.current = undefined;
        Vibration.vibrate([ 250, 125, 250 ]);
      }, delayMs);
      return true;
    };

    const clearForegroundFallbackReminder = () => {
      if (fallbackReminderRef.current) {
        clearTimeout(fallbackReminderRef.current);
        fallbackReminderRef.current = undefined;
      }
    };

    // Runs one reminder operation at a time; the controls stay disabled meanwhile.
    const runReminderTask = async task => {
      if (reminderBusyRef.current) { return; }
      reminderBusyRef.current = true;
      setIsReminderBusy(true);
      try {
        await task(reminderRouteKeyRef.current);
      } catch (exception) {
        console.warn('NextSchedule: reminder task failed:', exception);
      } finally {
        reminderBusyRef.current = false;
        setIsReminderBusy(false);
      }
    };

    const markReminderInactive = () => {
      clearForegroundFallbackReminder();
      reminderDepartureRef.current = undefined;
      setIsReminderActive(false);
    };

    const cancelDepartureReminder = async routeKey => {
      clearForegroundFallbackReminder();
      const result = await Reminders.cancelDepartureReminder({ origin, destination });
      if (routeKey !== reminderRouteKeyRef.current) { return; }
      markReminderInactive();
      setReminderStatus(result);
    };

    // Schedules (or replaces) the route's reminder `leadMinutes` before `departureTime`.
    const requestReminder = async (routeKey, departureTime, leadMinutes, successStatus) => {
      const result = await Reminders.scheduleDepartureReminder({ origin, destination, departureTime, leadMinutes });
      if (routeKey !== reminderRouteKeyRef.current) { return; }

      if (!result.ok && result.reason === 'unsupported' && setForegroundFallbackReminder(departureTime, leadMinutes)) {
        reminderDepartureRef.current = departureTime.valueOf();
        setActiveLead(leadMinutes);
        setIsReminderActive(true);
        setReminderStatus({ message: Lang.t('reminderForegroundOnlyMessage'), shortMessage: Lang.t('reminderForegroundOnlyShortMessage') });
        return;
      }

      reminderDepartureRef.current = result.ok ? result.departureAt : undefined;
      if (result.ok) { setActiveLead(leadMinutes); }
      setIsReminderActive(result.ok);
      setReminderStatus(result.ok && successStatus && !result.action ? successStatus : result);
    };

    const toggleDepartureReminder = () => runReminderTask(async routeKey => {
      if (isReminderActive) {
        await cancelDepartureReminder(routeKey);
        return;
      }

      if (!nextTripTime) { return; }
      await requestReminder(routeKey, nextTripTime, watchLayout ? DEFAULT_REMINDER_LEAD_MINUTES : reminderLeadMinutes);
    });

    const selectReminderLead = leadMinutes => {
      setIsLeadMenuVisible(false);
      setReminderLeadMinutes(leadMinutes);

      // An active reminder follows the new lead time right away.
      if (!nextTripTime || leadMinutes === activeReminderLeadRef.current && isReminderActive) { return; }

      const departureTime = nextTripTime;

      runReminderTask(routeKey => requestReminder(routeKey, departureTime, leadMinutes));
    };

    // F2: "Avisarme cuándo salir" reuses the route reminder with a lead equal to the walking margin.
    // Payload: { leaveAt, departure, walkMinutes }; the reminder stays pinned to the next departure.
    const remindToLeave = ({ leaveAt } = {}) => {
      if (!nextTripTime) { return; }

      const departureTime = nextTripTime;
      const leaveAtMs     = toMillis(leaveAt);
      const leadMinutes   = Number.isFinite(leaveAtMs)
        ? Math.max(1, Math.round((departureTime.valueOf() - leaveAtMs) / 60000))
        : reminderLeadMinutes;

      runReminderTask(routeKey => requestReminder(routeKey, departureTime, leadMinutes, {
        message:      Lang.t('remindToLeaveSetMessage'),
        shortMessage: Lang.t('remindToLeaveSetShortMessage')
      }));
    };

    const openReminderSettings = () => { Reminders.openSettings(reminderStatus?.action); };

    const buildTrackedTrip = () => {
      const arrival = getArrivalFor(nextTripTime);

      return {
        origin:      { id: origin.id, title: origin.title },
        destination: { id: destination.id, title: destination.title },
        departure:   nextTripTime ? nextTripTime.valueOf() : null,
        arrival:     arrival ? arrival.valueOf() : null,
        source:      scheduleSource
      };
    };

    const toggleTracking = async () => {
      if (isTrackingBusy || !nextTripTime) { return; }

      setIsTrackingBusy(true);

      try {
        if (isTracking) {
          await LiveTrip.stop();
          setIsTracking(false);
          return;
        }

        const started = await LiveTrip.start(buildTrackedTrip());

        setIsTracking(Boolean(started));
        if (!started) { setRouteStatus(Lang.t('trackTripFailedMessage')); }
      } catch (exception) {
        console.warn('NextSchedule: couldn\'t toggle trip tracking:', exception);
        setRouteStatus(Lang.t('trackTripFailedMessage'));
      } finally {
        setIsTrackingBusy(false);
      }
    };

    // Keeps an active reminder in sync with nextTripTime (live ETA updates, or advancing past the reminded train).
    useEffect(() => {
      const reminderDepartureAt = reminderDepartureRef.current;

      if (!nextTripTime || !isReminderActive || isReminderBusy || !Number.isFinite(reminderDepartureAt)) { return; }
      if (Math.abs(nextTripTime.valueOf() - reminderDepartureAt) < REMINDER_RESCHEDULE_THRESHOLD_MS) { return; }

      const departureTime = nextTripTime;
      const leadMinutes   = activeReminderLeadRef.current;

      runReminderTask(async routeKey => {
        if (reminderDepartureAt <= Date.now()) {
          await Reminders.cancelDepartureReminder({ origin, destination });
          if (routeKey === reminderRouteKeyRef.current) { markReminderInactive(); }
          return;
        }

        if (fallbackReminderRef.current) {
          if (setForegroundFallbackReminder(departureTime, leadMinutes)) {
            reminderDepartureRef.current = departureTime.valueOf();
            return;
          }

          markReminderInactive();
          setReminderStatus({ message: Lang.t('reminderUnavailableMessage'), shortMessage: Lang.t('reminderUnavailableShortMessage') });
          return;
        }

        const result = await Reminders.scheduleDepartureReminder({ origin, destination, departureTime, leadMinutes, requestPermissions: false });
        if (routeKey !== reminderRouteKeyRef.current) { return; }

        if (result.ok) {
          reminderDepartureRef.current = result.departureAt;
          setReminderStatus(result.action ? result : { message: Lang.t('reminderRescheduledMessage'), shortMessage: Lang.t('reminderRescheduledShortMessage') });
          return;
        }

        await Reminders.cancelDepartureReminder({ origin, destination });
        if (routeKey !== reminderRouteKeyRef.current) { return; }
        markReminderInactive();
        setReminderStatus(result);
      });
    }, [ nextTripTime, isReminderActive, isReminderBusy ]);

    // On the watch the feedback sits under the hero, so it's only shown briefly.
    useEffect(() => {
      if (!watchLayout || !reminderStatus) { return; }
      const timeout = setTimeout(() => setReminderStatus(undefined), reminderStatus.action ? 8000 : 4000);
      return () => clearTimeout(timeout);
    }, [ watchLayout, reminderStatus ]);

    // F1: a tracked trip follows live ETA updates and the train it's pinned to.
    useEffect(() => {
      if (!isTracking || !nextTripTime) { return; }

      Promise.resolve(LiveTrip.update(buildTrackedTrip())).catch(exception => {
        console.warn('NextSchedule: couldn\'t update the tracked trip:', exception);
      });
    }, [ isTracking, nextTripTime, scheduleSource ]);

    // Native surfaces (widgets, tile, complications, ongoing notification) read this snapshot.
    useEffect(() => {
      if (isPreviewData || nextDepartures.length === 0) { return; }

      const nextArrival = getArrivalFor(nextDepartures[0]);

      publishTripSnapshot({
        origin:      { id: origin.id, title: origin.title },
        destination: { id: destination.id, title: destination.title },
        departures:  nextDepartures.slice(0, SNAPSHOT_DEPARTURES_COUNT).map((departure, index) => {
          const arrival = getArrivalFor(departure);

          return {
            departure: departure.valueOf(),
            arrival:   arrival ? arrival.valueOf() : null,
            source:    getDepartureSource(index)
          };
        }),
        fetchedAt: dataFetchedAt || Date.now(),
        tracking:  {
          active:      isTracking,
          nextStation: null,
          arrivalAt:   isTracking && nextArrival ? nextArrival.valueOf() : null
        }
      });
    }, [ nextDepartures, scheduleSource, dataFetchedAt, isTracking ]);

    useFocusEffect(
      useCallback(() => {
        refreshFavoriteState();
      }, [ origin?.id, destination?.id ])
    );

    useEffect(() => {
      if (typeof(favoritesVersion) == 'undefined') { return; }
      refreshFavoriteState();
    }, [ favoritesVersion ]);

    useEffect(() => {
      refreshFavoriteState();
      refreshReminderState();
      refreshTrackingState();

      if (isPreviewData) {
        const previewTrips = [ 14, 36, 58, 82, 106 ].map(minutes => ({
          departure: dayjs().add(minutes, 'minute'),
          arrival:   dayjs().add(minutes + 27, 'minute')
        }));
        const previewDepartures = previewTrips.map(trip => trip.departure);
        const previewArrivals   = {};

        previewTrips.forEach(trip => { previewArrivals[trip.departure.valueOf()] = trip.arrival; });

        upcomingDeparturesRef.current = previewDepartures;
        arrivalByDepartureRef.current = previewArrivals;
        baseScheduleSourceRef.current = SOURCE.SCHEDULED;
        setNextTripTime(previewDepartures[0]);
        setNextDepartures(previewDepartures);
        setRemainingTimeMillis(previewDepartures[0].diff());
        setDataFetchedAt(Date.now() - 20 * 1000);
        setScheduleSource(SOURCE.LIVE);
        setShouldLoopAnimation(false);
        return;
      }

      fetchNextTripTime(origin.title, destination.title);
      fadeInNextTripTime();

      const subscription = AppState.addEventListener('change', nextAppState => {
        if (nextAppState !== 'active') { Vibration.cancel(); return; }

        // Back in the foreground: the countdown may be stale or the train may have already left.
        advanceDepartures({ refreshLiveEstimate: true });
      });

      return () => {
        subscription?.remove?.();
        if (fallbackReminderRef.current) { clearTimeout(fallbackReminderRef.current); }
        scheduleRequestRef.current++;
        upcomingDeparturesRef.current = [];
        arrivalByDepartureRef.current = {};
        liveEstimateRef.current       = null;
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

    // One tick per second keeps "en N min" fresh and advances past departed trains.
    useEffect(() => {
      if (typeof(nextTripTime) == 'undefined') { return; }

      const timeout = setTimeout(() => {
        if (typeof(nextTripTime) == 'undefined') { return; }
        const nextRemainingMillis = nextTripTime.diff();
        if (nextRemainingMillis > 0) {
          setRemainingTimeMillis( nextRemainingMillis );
        } else {
          advanceDepartures({ notifyDeparture: true });
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
        <MessageScreen
          title={crashMessage}
          action={<Button mode="contained" icon="refresh" onPress={retry}>{Lang.t('retryBtnLabel')}</Button>}
        />
      );
    }

    if (typeof(nextTripTime) == 'undefined') {
      return (
        <AppScreen scroll={false} contentStyle={styles.centerContent}>
          {watchLayout ? (
            // No card on watches: its full-width corners are clipped by a round face.
            <View style={[ styles.watchLoading, { width: watchListWidth } ]}>
              <LoadingIndicator size={40} accessibilityLabel={currentOperation} />
              <Text style={[ styles.watchLoadingText, { color: theme.text } ]}>{currentOperation}</Text>
            </View>
          ) : (
            <TransitCard style={styles.loadingCard}>
              <LoadingIndicator accessibilityLabel={currentOperation} />
              <Text variant="titleMedium" style={styles.centerText}>{currentOperation}</Text>
            </TransitCard>
          )}
        </AppScreen>
      );
    }

    /* Tokens: selection = secondaryContainer (tonal), action = primary, live = success. */

    const roles = theme.roles || {};
    const shape = theme.shape || {};
    const paperColors = theme.paperTheme.colors;
    const tokens = {
      heroSurface:   roles.surfaceContainerHigh || paperColors.surfaceVariant,
      tableSurface:  roles.surfaceContainerLow || theme.surface,
      rowSurface:    roles.surfaceContainerHigh || paperColors.surfaceVariant,
      outline:       roles.outlineVariant || paperColors.surfaceVariant,
      // Filled red actions use `roles.action` (in dark mode `roles.primary` is salmon).
      action:        roles.action || roles.primary || theme.accent,
      onAction:      roles.onAction || roles.onPrimary || paperColors.onPrimary,
      favorite:      roles.primary || theme.accent,
      selection:     roles.secondaryContainer || paperColors.secondaryContainer,
      onSelection:   roles.onSecondaryContainer || theme.text,
      emphasis:      roles.primaryContainer || theme.accentSoft,
      onEmphasis:    roles.onPrimaryContainer || theme.text
    };
    const emphasizedDisplay = theme.type?.emphasized?.display || { fontWeight: '700' };
    const emphasizedTitle   = theme.type?.emphasized?.title || { fontWeight: '700' };
    const radiusXl   = shape.xl ?? 28;
    const radiusLg   = shape.lg ?? 16;
    const radiusFull = shape.full ?? 999;

    const sourceDotColor = source => ({
      [SOURCE.LIVE]:    theme.success,
      [SOURCE.OFFLINE]: theme.offline
    }[source] || theme.textMuted);

    const effectiveWidth = layoutWidth || responsive.width;
    const twoColumns     = !watchLayout && (
      (isShortHeight && effectiveWidth >= SHORT_HEIGHT_TWO_COLUMNS_MIN)
      || (isExpanded && effectiveWidth >= EXPANDED_TWO_COLUMNS_MIN)
    );
    const columnWidth    = twoColumns ? (effectiveWidth - 16) / 2 : Math.min(effectiveWidth, SINGLE_COLUMN_MAX_WIDTH);
    const narrowTable    = columnWidth < NARROW_TABLE_MAX_WIDTH;
    const visibleCount   = watchLayout ? VISIBLE_DEPARTURES_COUNT.watch : (isShortHeight ? VISIBLE_DEPARTURES_COUNT.short : VISIBLE_DEPARTURES_COUNT.regular);
    const visibleDepartures = nextDepartures.slice(0, visibleCount);

    const nextArrival   = getArrivalFor(nextTripTime);
    const waitLabel     = formatWait(nextTripTime);
    const heroLabel     = Lang.t(scheduleSource === SOURCE.LIVE ? 'heroEstimatedDepartureLabel' : 'heroScheduledDepartureLabel');
    const segmentId     = getTargetSegment(atArgentinaWallTime(nextTripTime, 0, 12, 0));
    const segmentName   = segmentId ? (route.params.segmentsList || DEFAULT_SEGMENTS_LIST)[segmentId] : undefined;
    const heroTimeSize  = isShortHeight ? 48 : (responsive.isCompact ? 72 : 84);
    const isOfflineData = Boolean(networkErrorDetected) || scheduleSource === SOURCE.OFFLINE;

    const freshnessChip = isOfflineData ? (
      <Pressable
        onPress={openOfflineInfo}
        accessibilityRole="button"
        accessibilityLabel={`${sourceLabel(scheduleSource)}. ${Lang.t('screenOfflineModeInfoName')}`}
      >
        <FreshnessChip source={scheduleSource} fetchedAt={dataFetchedAt} compact={false} />
      </Pressable>
    ) : (
      <FreshnessChip source={scheduleSource} fetchedAt={dataFetchedAt} compact={false} />
    );

    const liveLoader = shouldLoopAnimation ? (
      <LoadingIndicator size={24} contained={false} style={watchLayout ? styles.haTimeLoaderWatch : styles.haTimeLoader} />
    ) : null;

    const walkEstimateCard = (
      <WalkEstimateCard
        station={{
          ...origin,
          latitude:  origin.latitude ?? origin.lat,
          longitude: origin.longitude ?? origin.lon
        }}
        departure={nextTripTime}
        followingDeparture={nextDepartures[1]}
        onRemindToLeave={remindToLeave}
        compact={watchLayout}
        style={watchLayout ? [ styles.watchCentered, { width: watchListWidth } ] : undefined}
      />
    );

    /* Watch: TimeText on top, one datum + one state, EdgeButton action, the rest on scroll. */

    if (watchLayout) {
      const watchScrollHintOpacity = scrollHintProgress.interpolate({
        inputRange: [ 0, 0.2, 0.78, 1 ],
        outputRange: [ 0, 0.72, 0.72, 0 ]
      });
      const shouldShowWatchScrollHint = nextDepartures.length > 1
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
                borderColor: tokens.action,
                backgroundColor: watchScrollHintIsRounded ? 'transparent' : tokens.action,
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

      const watchChip = ({ key, icon, label, onPress, selected = false, disabled = false, flex = false, accessibilityLabel }) => (
        <Pressable
          key={key}
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || label}
          accessibilityState={{ selected, disabled }}
          style={({ pressed }) => [
            styles.watchChip,
            flex ? styles.watchChipFlex : undefined,
            {
              backgroundColor: selected ? tokens.selection : tokens.rowSurface,
              borderRadius: radiusFull,
              opacity: pressed || disabled ? 0.72 : 1
            }
          ]}
        >
          <MaterialCommunityIcons name={icon} size={16} color={selected ? tokens.onSelection : theme.textMuted} />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={[ styles.watchChipLabel, { color: selected ? tokens.onSelection : theme.text } ]}
          >
            {label}
          </Text>
        </Pressable>
      );

      const watchFreshness = (
        <View style={styles.watchFreshness}>
          {isOfflineData ? (
            <Pressable onPress={openOfflineInfo} accessibilityRole="button" accessibilityLabel={`${sourceLabel(scheduleSource)}. ${Lang.t('screenOfflineModeInfoName')}`}>
              <FreshnessChip source={scheduleSource} fetchedAt={dataFetchedAt} />
            </Pressable>
          ) : (
            <FreshnessChip source={scheduleSource} fetchedAt={dataFetchedAt} />
          )}
        </View>
      );

      const reminderEdgeLabel = isReminderActive ? Lang.t('reminderSetShortMessage') : Lang.t('remindMeShortBtnLabel');

      return (
        <View style={styles.scheduleFrame}>
          <AppScreen
            contentStyle={styles.stackGapWatch}
            onScroll={handleScheduleScroll}
          >
            <View style={{ height: watchTopBand }} />

            <WatchScaleItem>
              <View style={[ styles.watchRouteRow, { width: watchHeaderTextWidth } ]}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  ellipsizeMode="clip"
                  style={[ styles.watchRouteText, { color: theme.textMuted } ]}
                  accessibilityLabel={`${origin.title} ${Lang.t('to')} ${destination.title}`}
                >
                  {origin.title} → <Text style={[ styles.watchRouteDestination, { color: theme.text } ]}>{destination.title}</Text>
                </Text>
              </View>
            </WatchScaleItem>

            <WatchScaleItem>
              <Pressable
                onPress={() => openTripDetail(nextTripTime)}
                accessibilityRole="button"
                accessibilityLabel={`${heroLabel} ${nextTripTime.format('HH:mm')}, ${waitLabel}. ${Lang.t('viewTripBtnLabel')}`}
                style={styles.watchHero}
              >
                <Animated.View style={{ opacity: shouldLoopAnimation ? nextTripViewOpacity : 1 }}>
                  <Text
                    style={[
                      styles.watchHeroTime,
                      emphasizedDisplay,
                      { color: theme.text, fontSize: watchTimeFontSize, lineHeight: watchTimeFontSize + 4 }
                    ]}
                  >
                    {nextTripTime.format('HH:mm')}
                  </Text>
                </Animated.View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[ styles.watchHeroWait, { color: theme.text, fontSize: watchWaitFontSize, lineHeight: watchWaitFontSize + 4 } ]}
                >
                  {waitLabel}
                </Text>
              </Pressable>
            </WatchScaleItem>

            <WatchScaleItem>{watchFreshness}</WatchScaleItem>

            {reminderStatus ? (
              <WatchScaleItem>
                <Pressable
                  onPress={reminderStatus.action ? openReminderSettings : undefined}
                  disabled={!reminderStatus.action}
                  accessibilityRole={reminderStatus.action ? 'button' : 'text'}
                  accessibilityLabel={reminderStatus.action ? `${reminderStatus.message} ${Lang.t('reminderOpenSettingsBtnLabel')}` : reminderStatus.message}
                  style={[ styles.watchReminderFeedback, { backgroundColor: tokens.selection, width: watchActionsWidth, borderRadius: radiusFull } ]}
                >
                  {reminderStatus.action ? <MaterialCommunityIcons name="cog-outline" size={14} color={tokens.onSelection} /> : null}
                  <Text numberOfLines={2} style={[ styles.watchReminderFeedbackText, { color: tokens.onSelection } ]}>
                    {compactReminderStatus(reminderStatus)}
                  </Text>
                </Pressable>
              </WatchScaleItem>
            ) : null}

            {routeStatus ? (
              <WatchScaleItem>
                <StatusPill tone="neutral" style={styles.statusMessage}>{routeStatus}</StatusPill>
              </WatchScaleItem>
            ) : null}

            {liveLoader ? <WatchScaleItem>{liveLoader}</WatchScaleItem> : null}

            {visibleDepartures.length > 1 ? (
              <WatchScaleItem>
                <Text style={[ styles.watchSectionTitle, emphasizedTitle, { color: theme.text } ]}>{Lang.t('nextDeparturesTitle')}</Text>
              </WatchScaleItem>
            ) : null}

            {visibleDepartures.length > 1 ? visibleDepartures.map((departure, index) => (
              <WatchScaleItem key={departure.toISOString()}>
                <Pressable
                  onPress={() => openTripDetail(departure)}
                  accessibilityRole="button"
                  accessibilityLabel={Lang.t('departureRowA11yLabel', {
                    time:   departure.format('HH:mm'),
                    source: sourceLabel(getDepartureSource(index)),
                    wait:   formatWait(departure)
                  })}
                  style={({ pressed }) => [
                    styles.watchDepartureRow,
                    {
                      width: watchListWidth,
                      backgroundColor: tokens.rowSurface,
                      borderRadius: radiusFull,
                      opacity: pressed ? 0.72 : 1
                    }
                  ]}
                >
                  <View style={styles.watchDepartureTimeCol}>
                    {getDepartureSource(index) === SOURCE.LIVE ? <View style={[ styles.sourceDot, { backgroundColor: theme.success } ]} /> : null}
                    <Text style={[ styles.watchDepartureTime, { color: theme.text } ]}>{departure.format('HH:mm')}</Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={[ styles.watchDepartureWait, { color: theme.textMuted } ]}
                  >
                    {formatWait(departure)}
                  </Text>
                </Pressable>
              </WatchScaleItem>
            )) : null}

            <WatchScaleItem>{walkEstimateCard}</WatchScaleItem>

            {/* One action per row: two side by side leave ~25 dp for each label on a 192 dp face. */}
            <WatchScaleItem>
              <View style={[ styles.watchChipRow, { width: watchListWidth } ]}>
                {watchChip({ key: 'schedule', icon: 'calendar-clock', label: Lang.t('viewFullScheduleShortBtnLabel'), accessibilityLabel: Lang.t('viewFullScheduleBtnLabel'), onPress: openFullSchedule, flex: true })}
              </View>
            </WatchScaleItem>

            <WatchScaleItem>
              <View style={[ styles.watchChipRow, { width: watchListWidth } ]}>
                {watchChip({ key: 'trip', icon: 'map-marker-path', label: Lang.t('viewTripShortBtnLabel'), accessibilityLabel: Lang.t('viewTripBtnLabel'), onPress: () => openTripDetail(nextTripTime), flex: true })}
              </View>
            </WatchScaleItem>

            {liveTripAvailable ? (
              <WatchScaleItem>
                <View style={[ styles.watchChipRow, { width: watchListWidth } ]}>
                  {watchChip({
                    key:      'track',
                    icon:     isTracking ? 'stop-circle-outline' : 'navigation-variant-outline',
                    label:    isTracking ? Lang.t('stopTrackingTripBtnLabel') : Lang.t('trackTripShortBtnLabel'),
                    accessibilityLabel: isTracking ? Lang.t('stopTrackingTripBtnLabel') : Lang.t('trackTripBtnLabel'),
                    onPress:  toggleTracking,
                    selected: isTracking,
                    disabled: isTrackingBusy,
                    flex:     true
                  })}
                </View>
              </WatchScaleItem>
            ) : null}

            <WatchScaleItem>
              <View style={[ styles.watchChipRow, { width: watchListWidth } ]}>
                <Pressable
                  onPress={toggleFavorite}
                  accessibilityRole="button"
                  accessibilityLabel={isFavorite ? Lang.t('removeFavoriteBtnLabel') : Lang.t('addFavoriteBtnLabel')}
                  accessibilityState={{ selected: isFavorite }}
                  style={({ pressed }) => [
                    styles.watchIconButton,
                    {
                      backgroundColor: isFavorite ? tokens.selection : tokens.rowSurface,
                      opacity: pressed ? 0.72 : 1
                    }
                  ]}
                >
                  <MaterialCommunityIcons name={isFavorite ? 'star' : 'star-outline'} size={20} color={isFavorite ? tokens.favorite : theme.textMuted} />
                </Pressable>
                {watchChip({ key: 'reverse', icon: 'swap-horizontal', label: Lang.t('reverseRouteShortBtnLabel'), accessibilityLabel: Lang.t('reverseRouteBtnLabel'), onPress: reverseRoute, flex: true })}
              </View>
            </WatchScaleItem>

            <View style={{ height: watchScheduleEndPadding }} />
          </AppScreen>

          <View pointerEvents="none" style={[ styles.watchTimeTextSlot, { height: watchTopBand, backgroundColor: theme.background } ]}>
            <CurvedText text={nowInArgentina().format('HH:mm')} position="top" fontSize={12} color={theme.textMuted} />
          </View>

          <View pointerEvents="box-none" style={styles.watchEdgeButtonSlot}>
            <EdgeButton
              label={reminderEdgeLabel}
              icon={isReminderActive ? 'bell-check-outline' : 'bell-outline'}
              onPress={toggleDepartureReminder}
              disabled={isReminderBusy}
              accessibilityLabel={isReminderActive
                ? Lang.t('cancelReminderBtnLabel')
                : Lang.t('remindMeLeadBtnLabel', { minutes: DEFAULT_REMINDER_LEAD_MINUTES })}
            />
          </View>

          {watchSideScrollHint}
        </View>
      );
    }

    /* Phone, foldable, tablet and desktop. */

    const routeHeader = (
      <RouteHeader
        origin={origin}
        destination={destination}
        onSwap={reverseRoute}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
        subtitle={segmentName}
        compact={isShortHeight}
      />
    );

    const waitPill = (
      <View style={[ styles.waitPill, { backgroundColor: tokens.emphasis, borderRadius: radiusFull }, isShortHeight ? styles.waitPillShort : undefined ]}>
        <MaterialCommunityIcons name="clock-outline" size={isShortHeight ? 18 : 20} color={tokens.onEmphasis} />
        <Text numberOfLines={1} style={[ styles.waitPillText, emphasizedTitle, { color: tokens.onEmphasis }, isShortHeight ? styles.waitPillTextShort : undefined ]}>
          {waitLabel}
        </Text>
      </View>
    );

    const arrivalText = nextArrival ? (
      <Text variant="bodyMedium" style={[ styles.heroArrival, { color: theme.textMuted } ]}>
        {Lang.t('arrivalAtMessage', { time: nextArrival.format('HH:mm') })}
      </Text>
    ) : null;

    const heroTime = (
      <Animated.View style={{ opacity: shouldLoopAnimation ? nextTripViewOpacity : 1 }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[
            styles.heroTime,
            emphasizedDisplay,
            { color: theme.text, fontSize: heroTimeSize, lineHeight: Math.round(heroTimeSize * 1.1) },
            isShortHeight ? styles.heroTimeShort : undefined
          ]}
          accessibilityLabel={`${heroLabel} ${nextTripTime.format('HH:mm')}, ${waitLabel}`}
        >
          {nextTripTime.format('HH:mm')}
        </Text>
      </Animated.View>
    );

    const hero = (
      <View style={[ styles.hero, { backgroundColor: tokens.heroSurface, borderRadius: radiusXl }, isShortHeight ? styles.heroShort : undefined ]}>
        {isShortHeight ? (
          <View style={styles.heroShortRow}>
            <View style={styles.heroShortTimeCol}>
              <Text variant="labelLarge" numberOfLines={1} style={{ color: theme.textMuted }}>{heroLabel}</Text>
              {heroTime}
            </View>
            <View style={[ styles.heroDivider, { backgroundColor: tokens.outline } ]} />
            <View style={styles.heroShortInfoCol}>
              {waitPill}
              {arrivalText}
              {freshnessChip}
            </View>
          </View>
        ) : (
          <>
            {freshnessChip}
            <Text variant="titleSmall" style={[ styles.heroLabel, { color: theme.textMuted } ]}>{heroLabel}</Text>
            {heroTime}
            {waitPill}
            {arrivalText}
          </>
        )}
        {liveLoader}
      </View>
    );

    const currentLead       = isReminderActive ? activeReminderLead : reminderLeadMinutes;
    const reminderLabel     = isReminderActive
      ? Lang.t('reminderActiveLeadBtnLabel', { minutes: activeReminderLead })
      : Lang.t('remindMeLeadBtnLabel', { minutes: reminderLeadMinutes });
    const reminderSurface   = isReminderActive ? tokens.selection : tokens.action;
    const reminderOnSurface = isReminderActive ? tokens.onSelection : tokens.onAction;
    const actionHeight      = isShortHeight ? 44 : 56;

    // M3 Expressive split button: primary action + lead time menu.
    const reminderSplitButton = (
      <View style={styles.splitButton}>
        <Pressable
          onPress={toggleDepartureReminder}
          disabled={isReminderBusy}
          accessibilityRole="button"
          accessibilityLabel={isReminderActive ? Lang.t('cancelReminderBtnLabel') : reminderLabel}
          accessibilityState={{ selected: isReminderActive, disabled: isReminderBusy, busy: isReminderBusy }}
          style={({ pressed }) => [
            styles.splitPrimary,
            {
              height: actionHeight,
              backgroundColor: reminderSurface,
              borderTopLeftRadius: radiusFull,
              borderBottomLeftRadius: radiusFull,
              opacity: pressed || isReminderBusy ? 0.72 : 1
            }
          ]}
        >
          <MaterialCommunityIcons name={isReminderActive ? 'bell-check-outline' : 'bell-outline'} size={22} color={reminderOnSurface} />
          <Text numberOfLines={1} style={[ styles.splitLabel, emphasizedTitle, { color: reminderOnSurface } ]}>{reminderLabel}</Text>
        </Pressable>
        <LazyMenu
          visible={isLeadMenuVisible}
          onDismiss={() => setIsLeadMenuVisible(false)}
          anchorPosition="bottom"
          anchor={(
            <Pressable
              onPress={() => setIsLeadMenuVisible(true)}
              disabled={isReminderBusy}
              accessibilityRole="button"
              accessibilityLabel={Lang.t('reminderLeadMenuLabel')}
              accessibilityState={{ expanded: isLeadMenuVisible, disabled: isReminderBusy }}
              style={({ pressed }) => [
                styles.splitTrailing,
                {
                  height: actionHeight,
                  backgroundColor: reminderSurface,
                  borderTopRightRadius: radiusFull,
                  borderBottomRightRadius: radiusFull,
                  opacity: pressed || isReminderBusy ? 0.72 : 1
                }
              ]}
            >
              <MaterialCommunityIcons name={isLeadMenuVisible ? 'chevron-up' : 'chevron-down'} size={24} color={reminderOnSurface} />
            </Pressable>
          )}
        >
          {REMINDER_LEAD_OPTIONS.map(minutes => (
            <LazyMenu.Item
              key={minutes}
              leadingIcon={minutes === currentLead ? 'check' : undefined}
              title={Lang.t('reminderLeadOptionLabel', { minutes })}
              onPress={() => selectReminderLead(minutes)}
            />
          ))}
        </LazyMenu>
      </View>
    );

    const trackButton = liveTripAvailable ? (
      <Button
        mode={isTracking ? 'contained-tonal' : 'outlined'}
        icon={isTracking ? 'stop-circle-outline' : 'navigation-variant-outline'}
        onPress={toggleTracking}
        disabled={isTrackingBusy}
        loading={isTrackingBusy}
        accessibilityState={{ selected: isTracking }}
        style={styles.fullWidthButton}
        contentStyle={{ minHeight: isShortHeight ? 40 : 48 }}
      >
        {isTracking ? Lang.t('stopTrackingTripBtnLabel') : Lang.t('trackTripBtnLabel')}
      </Button>
    ) : null;

    const statusMessages = (routeStatus || reminderStatus) ? (
      <View style={styles.statusStack}>
        {routeStatus ? <StatusPill tone="neutral" style={styles.statusMessage}>{routeStatus}</StatusPill> : null}
        {reminderStatus ? <StatusPill tone="neutral" style={styles.statusMessage}>{reminderStatus.message}</StatusPill> : null}
        {reminderStatus?.action ? (
          <Button mode="text" icon="cog-outline" compact onPress={openReminderSettings} style={styles.statusMessage}>
            {Lang.t('reminderOpenSettingsBtnLabel')}
          </Button>
        ) : null}
      </View>
    ) : null;

    const departuresTable = visibleDepartures.length > 0 ? (
      <View style={[ styles.tableCard, { backgroundColor: tokens.tableSurface, borderColor: tokens.outline, borderRadius: radiusXl } ]}>
        <Text variant="titleMedium" style={[ styles.tableTitle, emphasizedTitle, { color: theme.text } ]}>{Lang.t('nextDeparturesTitle')}</Text>
        <View style={styles.tableHeaderRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.colIcon} />
          <Text variant="labelMedium" style={[ styles.colTime, { color: theme.textMuted } ]}>{Lang.t('departuresTableTime')}</Text>
          <Text variant="labelMedium" style={[ styles.colSource, { color: theme.textMuted } ]}>{Lang.t('departuresTableSource')}</Text>
          <Text variant="labelMedium" style={[ styles.colWait, { color: theme.textMuted } ]}>{Lang.t('departuresTableWait')}</Text>
          <View style={styles.colChevron} />
        </View>
        {visibleDepartures.map((departure, index) => {
          const source     = getDepartureSource(index);
          const arrival    = getArrivalFor(departure);
          const isNext     = index === 0;
          const wait       = formatWait(departure);
          const rowColor   = isNext ? tokens.onSelection : theme.text;

          return (
            <Pressable
              key={departure.toISOString()}
              onPress={() => openTripDetail(departure)}
              accessibilityRole="button"
              accessibilityLabel={Lang.t('departureRowA11yLabel', { time: departure.format('HH:mm'), source: sourceLabel(source), wait })}
              style={({ pressed }) => [
                styles.tableRow,
                {
                  borderRadius: radiusLg,
                  backgroundColor: isNext ? tokens.selection : 'transparent',
                  borderTopColor: index > 1 ? tokens.outline : 'transparent',
                  opacity: pressed ? 0.72 : 1
                },
                isShortHeight ? styles.tableRowShort : undefined
              ]}
            >
              <View style={styles.colIcon}>
                <MaterialCommunityIcons name={isNext ? 'train' : 'clock-outline'} size={20} color={isNext ? tokens.onSelection : theme.textMuted} />
              </View>
              <View style={styles.colTime}>
                <Text style={[ styles.rowTime, { color: rowColor } ]}>{departure.format('HH:mm')}</Text>
                {arrival && !isShortHeight ? (
                  <Text numberOfLines={1} style={[ styles.rowArrival, { color: theme.textMuted } ]}>
                    {Lang.t('arrivalShortMessage', { time: arrival.format('HH:mm') })}
                  </Text>
                ) : null}
              </View>
              <View style={[ styles.colSource, styles.sourceCell ]}>
                <View style={[ styles.sourceDot, { backgroundColor: sourceDotColor(source) } ]} />
                <Text numberOfLines={1} style={[ styles.rowSource, { color: theme.textMuted } ]}>
                  {narrowTable ? sourceShortLabel(source) : sourceLabel(source)}
                </Text>
              </View>
              <Text numberOfLines={1} style={[ styles.colWait, styles.rowWait, { color: rowColor }, isNext ? styles.rowWaitNext : undefined ]}>
                {wait}
              </Text>
              <View style={styles.colChevron}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
              </View>
            </Pressable>
          );
        })}
      </View>
    ) : null;

    const links = (
      <View style={styles.linksRow}>
        <Button
          mode="contained-tonal"
          icon="calendar-clock"
          onPress={openFullSchedule}
          style={styles.linkButton}
          contentStyle={{ minHeight: isShortHeight ? 40 : 48 }}
          labelStyle={styles.linkLabel}
        >
          {Lang.t('viewFullScheduleBtnLabel')}
        </Button>
        <Button
          mode="contained-tonal"
          icon="map-marker-path"
          onPress={() => openTripDetail(nextTripTime)}
          style={styles.linkButton}
          contentStyle={{ minHeight: isShortHeight ? 40 : 48 }}
          labelStyle={styles.linkLabel}
        >
          {Lang.t('viewTripBtnLabel')}
        </Button>
      </View>
    );

    const columnGap = isShortHeight ? styles.columnGapShort : styles.columnGap;

    return (
      <View style={styles.scheduleFrame}>
        <AppScreen
          contentWidth={embedded ? 'full' : 'wide'}
          contentStyle={[ styles.stackGap, embedded ? styles.stackGapEmbedded : undefined ]}
          style={embedded ? styles.embeddedScreen : undefined}
        >
          <View style={styles.layoutMeasure} onLayout={event => setLayoutWidth(Math.round(event.nativeEvent.layout.width))}>
            <View style={[ styles.layoutRoot, columnGap, twoColumns ? undefined : styles.singleColumn ]}>
              {routeHeader}
              {twoColumns ? (
                <View style={styles.columns}>
                  <View style={[ styles.column, columnGap ]}>
                    {hero}
                    {reminderSplitButton}
                    {trackButton}
                    {statusMessages}
                    {walkEstimateCard}
                  </View>
                  <View style={[ styles.column, columnGap ]}>
                    {departuresTable}
                    {links}
                  </View>
                </View>
              ) : (
                <>
                  {hero}
                  {walkEstimateCard}
                  {reminderSplitButton}
                  {trackButton}
                  {statusMessages}
                  {departuresTable}
                  {links}
                </>
              )}
            </View>
          </View>
        </AppScreen>
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
  watchLoading: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 10
  },
  watchLoadingText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600'
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
  layoutMeasure: {
    width: '100%'
  },
  layoutRoot: {
    width: '100%'
  },
  singleColumn: {
    maxWidth: SINGLE_COLUMN_MAX_WIDTH,
    alignSelf: 'center'
  },
  columnGap: {
    gap: 12
  },
  columnGapShort: {
    gap: 8
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16
  },
  column: {
    flex: 1,
    minWidth: 0
  },

  /* Hero */
  hero: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 6,
    overflow: 'hidden'
  },
  heroShort: {
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  heroLabel: {
    textAlign: 'center',
    marginTop: 6
  },
  heroTime: {
    textAlign: 'center',
    includeFontPadding: false
  },
  heroTimeShort: {
    textAlign: 'left'
  },
  heroArrival: {
    textAlign: 'center'
  },
  heroShortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  heroShortTimeCol: {
    flexShrink: 0
  },
  heroShortInfoCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 6
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth * 2,
    alignSelf: 'stretch'
  },
  waitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 2
  },
  waitPillShort: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 0
  },
  waitPillText: {
    fontSize: 20,
    lineHeight: 26
  },
  waitPillTextShort: {
    fontSize: 17,
    lineHeight: 22
  },

  /* Reminder split button */
  splitButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  splitPrimary: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6
  },
  splitTrailing: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6
  },
  splitLabel: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22
  },
  fullWidthButton: {
    width: '100%'
  },
  statusStack: {
    alignItems: 'center',
    gap: 6
  },
  statusMessage: {
    alignSelf: 'center'
  },

  /* Departures table */
  tableCard: {
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth
  },
  tableTitle: {
    paddingHorizontal: 10,
    marginBottom: 6
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  tableRowShort: {
    minHeight: 44
  },
  colIcon: {
    width: 28
  },
  colTime: {
    width: 72
  },
  colSource: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8
  },
  colWait: {
    minWidth: 76,
    textAlign: 'right'
  },
  colChevron: {
    width: 24,
    alignItems: 'flex-end'
  },
  sourceCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  sourceDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  rowTime: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    fontVariant: [ 'tabular-nums' ]
  },
  rowArrival: {
    fontSize: 12,
    lineHeight: 15
  },
  rowSource: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 17
  },
  rowWait: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600'
  },
  rowWaitNext: {
    fontWeight: '800'
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  linkButton: {
    flexGrow: 1,
    flexBasis: 'auto'
  },
  linkLabel: {
    fontWeight: '700'
  },
  haTimeLoader: {
    position: 'absolute',
    top: 16,
    right: 16
  },

  /* Watch */
  stackGapWatch: {
    gap: 4,
    justifyContent: 'flex-start',
    alignItems: 'center'
  },
  watchCentered: {
    alignSelf: 'center'
  },
  watchTimeTextSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
    zIndex: 10,
    elevation: 10
  },
  watchEdgeButtonSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 15,
    elevation: 15
  },
  watchRouteRow: {
    alignSelf: 'center',
    alignItems: 'center'
  },
  watchRouteText: {
    width: '100%',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    includeFontPadding: false
  },
  watchRouteDestination: {
    fontWeight: '800'
  },
  watchHero: {
    alignSelf: 'center',
    alignItems: 'center'
  },
  watchHeroTime: {
    textAlign: 'center',
    includeFontPadding: false
  },
  watchHeroWait: {
    textAlign: 'center',
    fontWeight: '800',
    includeFontPadding: false
  },
  watchFreshness: {
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: 2
  },
  watchSectionTitle: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 16,
    marginTop: 10
  },
  watchDepartureRow: {
    alignSelf: 'center',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    marginTop: 2
  },
  watchDepartureTimeCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0
  },
  watchDepartureTime: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    fontVariant: [ 'tabular-nums' ]
  },
  watchDepartureWait: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600'
  },
  watchChipRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4
  },
  watchChip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10
  },
  watchChipFlex: {
    flex: 1,
    minWidth: 0
  },
  watchChipLabel: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700'
  },
  watchIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  watchReminderFeedback: {
    alignSelf: 'center',
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    marginTop: 2
  },
  watchReminderFeedbackText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700'
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
  haTimeLoaderWatch: {
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 2
  }
});

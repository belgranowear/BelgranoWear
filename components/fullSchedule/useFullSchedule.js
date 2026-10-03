import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    DEFAULT_SEGMENTS_LIST,
    SOURCE,
    fetchScheduleOptions,
    findTargetSegmentId,
    isHolidayDate
} from '../../includes/Schedule';
import { nowInArgentina } from '../../includes/Time';
import { getUIPreviewMode } from '../../includes/UIPreview';

import {
    buildDayTrips,
    buildPreviewOptions,
    buildSections,
    durationMinutes,
    findNextTripIndex,
    findSegmentDayOffset,
    listSegments
} from './model';

const CLOCK_TICK_MS = 30 * 1000;
const PREVIEW_MODES = [ 'full-schedule', 'watch-full-schedule' ];

export const STATUS = {
    LOADING: 'loading',
    ERROR:   'error',
    READY:   'ready'
};

/**
 * State and data for the full schedule of one route: segment selection (defaults to
 * today's segment), the static timetable of the selected segment (network → offline cache
 * via `fetchScheduleOptions`), hour sections with the "Ahora" divider, and a summary.
 */
export default function useFullSchedule(params) {
    const { origin, destination, holidaysList } = params || {};
    const segmentsList = params?.segmentsList && Object.keys(params.segmentsList).length > 0
        ? params.segmentsList
        : DEFAULT_SEGMENTS_LIST;

    const [ now, setNow ] = useState(() => nowInArgentina());

    useEffect(() => {
        const timer = setInterval(() => setNow(nowInArgentina()), CLOCK_TICK_MS);

        return () => clearInterval(timer);
    }, []);

    const segments       = useMemo(() => listSegments(segmentsList), [ segmentsList ]);
    const dayKey         = now.format('YYYY-MM-DD');
    const todaySegmentId = useMemo(() => {
        const id = findTargetSegmentId(now, segmentsList, holidaysList);

        return id !== null && typeof(id) !== 'undefined' ? String(id) : (segments[0]?.id || null);
        // Re-evaluated once per Argentina calendar day.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ dayKey, segmentsList, holidaysList, segments ]);

    const today = useMemo(() => ({
        date:              now,
        dayOfWeek:         now.day(),
        isHoliday:         isHolidayDate(now, holidaysList),
        isTomorrowHoliday: isHolidayDate(now.add(1, 'day'), holidaysList)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [ dayKey, holidaysList ]);

    const [ selectedSegmentId, setSelectedSegmentId ] = useState(() => (
        params?.segmentId ? String(params.segmentId) : todaySegmentId
    ));

    // Keep following "today" when the day changes and the user was looking at today's segment.
    const previousTodayRef = useRef(todaySegmentId);

    useEffect(() => {
        if (previousTodayRef.current !== todaySegmentId) {
            setSelectedSegmentId(current => (current === previousTodayRef.current ? todaySegmentId : current));
            previousTodayRef.current = todaySegmentId;
        }
    }, [ todaySegmentId ]);

    const [ state, setState ]  = useState({ status: STATUS.LOADING, options: null, source: null, fetchedAt: null });
    const [ attempt, setAttempt ] = useState(0);
    const cacheRef = useRef({});

    useEffect(() => {
        let cancelled = false;
        const segment = selectedSegmentId;
        const cached  = cacheRef.current[segment];

        if (!segment || !origin || !destination) {
            setState({ status: STATUS.ERROR, options: null, source: null, fetchedAt: null });
            return undefined;
        }

        if (cached) {
            setState({ status: STATUS.READY, ...cached });
            return undefined;
        }

        setState(current => ({ ...current, status: STATUS.LOADING }));

        const loadFullSchedule = async () => {
            const result = PREVIEW_MODES.indexOf(getUIPreviewMode()) > -1
                ? { options: buildPreviewOptions(segment), source: SOURCE.SCHEDULED }
                : await fetchScheduleOptions(segment, origin.id, destination.id);

            if (cancelled) { return; }

            if (!result || !Array.isArray(result.options)) {
                console.warn('FullSchedule: no timetable for segment', segment);
                setState({ status: STATUS.ERROR, options: null, source: null, fetchedAt: null });
                return;
            }

            const entry = { options: result.options, source: result.source, fetchedAt: Date.now() };

            cacheRef.current[segment] = entry;
            setState({ status: STATUS.READY, ...entry });
        };

        loadFullSchedule().catch(exception => {
            console.warn('FullSchedule: failed to load timetable:', exception);
            if (!cancelled) { setState({ status: STATUS.ERROR, options: null, source: null, fetchedAt: null }); }
        });

        return () => { cancelled = true; };
    }, [ selectedSegmentId, origin?.id, destination?.id, attempt ]);

    const reload = useCallback(() => {
        delete cacheRef.current[selectedSegmentId];
        setAttempt(value => value + 1);
    }, [ selectedSegmentId ]);

    const isToday   = selectedSegmentId === todaySegmentId;
    const dayOffset = useMemo(() => (
        isToday ? 0 : findSegmentDayOffset(now, selectedSegmentId, segmentsList, holidaysList)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [ isToday, selectedSegmentId, dayKey, segmentsList, holidaysList ]);

    // Trips only depend on the day; `now` (ticking) only moves the "Ahora" divider.
    const trips = useMemo(() => (
        state.options ? buildDayTrips(now, dayOffset, state.options) : []
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [ state.options, dayOffset, dayKey ]);

    const nextIndex = findNextTripIndex(trips, now, isToday);
    const sections  = useMemo(() => buildSections(trips, nextIndex), [ trips, nextIndex ]);

    const summary = useMemo(() => {
        if (trips.length === 0) { return null; }

        const durations = trips.map(durationMinutes).filter(value => value !== null).sort((a, b) => a - b);

        return {
            first:          trips[0],
            last:           trips[trips.length - 1],
            count:          trips.length,
            typicalMinutes: durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null
        };
    }, [ trips ]);

    return {
        now,
        today,
        segments,
        segmentsList,
        todaySegmentId,
        selectedSegmentId,
        setSelectedSegmentId,
        selectedSegment: segments.find(segment => segment.id === selectedSegmentId) || null,
        todaySegment:    segments.find(segment => segment.id === todaySegmentId) || null,
        isToday,
        dayOffset,
        status:    state.status,
        source:    state.source,
        fetchedAt: state.fetchedAt,
        trips,
        nextIndex,
        nextTrip:  nextIndex > -1 ? trips[nextIndex] || null : null,
        sections,
        summary,
        reload
    };
}

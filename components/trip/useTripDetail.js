import { useCallback, useEffect, useRef, useState } from 'react';

import { Platform } from 'react-native';

import Cache from '../../includes/Cache';
import { fetchWithTimeout } from '../../includes/Network';
import {
    DEFAULT_SEGMENTS_LIST,
    SOURCE,
    atArgentinaWallTime,
    buildTrips,
    fetchLiveRows,
    fetchLiveStationsList,
    fetchScheduleOptions,
    findLiveStationIndex,
    findTargetSegmentId,
    pickLiveDeparture,
    scheduleUrl,
    stationIdsBetween,
    toArgentinaWallClock
} from '../../includes/Schedule';
import { nowInArgentina } from '../../includes/Time';
import {
    findArrivalByDeparture,
    findConfirmingRow,
    findDepartureByArrival,
    formatWallMinutes,
    inferTrainPosition,
    isLivePositionApplicable,
    pickTrip,
    runWithConcurrency,
    upstreamDeltas,
    upstreamStationIds,
    wallMinutes,
    wallTextOf
} from '../../includes/TripTimes';
import { getUIPreviewMode } from '../../includes/UIPreview';

// Per-segment JSONs are small and cached by Cache; keep the burst polite.
const SCHEDULE_CONCURRENCY = 3;
const CLOCK_TICK_MS        = 30 * 1000;
const PREVIEW_MODES        = [ 'trip', 'watch-trip' ];

// Mirrors availability_options.json; only used when it can't be fetched nor read from cache.
const FALLBACK_STATION_TITLES = {
    1: 'Retiro', 2: 'Saldías', 3: 'C. Universitaria', 4: 'A. del Valle', 5: 'M. Padilla', 6: 'Florida',
    7: 'Munro', 8: 'Carapachay', 9: 'V. Adelina', 10: 'Boulogne Sur Mer', 11: 'Montes', 12: 'Don Torcuato',
    13: 'A. Sourdeaux', 14: 'Villa de Mayo', 15: 'Los Polvorines', 16: 'Ing. P. Nogues', 17: 'Grand Bourg',
    18: 'Tierras Altas', 19: 'Tortuguitas', 20: 'M. Alberti', 21: 'Del Viso', 22: 'Cecilia Grierson', 23: 'Villa Rosa'
};

// Read-only reuse of the station list DestinationPicker caches (same URL → same Cache key).
async function loadStationTitles() {
    const url = process.env.REMOTE_BASE_URL + '/availability_options.json';
    let   json = null;

    try {
        json = await (await fetchWithTimeout(url)).json();
    } catch (exception) {
        json = await Cache.get(url);
    }

    const titles = { ...FALLBACK_STATION_TITLES };

    Object.keys(json?.destination || {}).forEach(id => { titles[parseInt(id, 10)] = json.destination[id]; });

    return titles;
}

// Argentina calendar-day difference between two instants.
const argentinaDayOffset = (from, to) => {
    const dayOf = instant => {
        const wall = toArgentinaWallClock(instant);

        return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
    };

    return Math.round((dayOf(to) - dayOf(from)) / 86400000);
};

// Deterministic data for `?uiPreview=trip|watch-trip` when the network isn't reachable.
const buildPreviewOptions = (originId, stationId, departureText) => {
    const hops = Math.abs(parseInt(stationId, 10) - parseInt(originId, 10));
    const base = wallMinutes(departureText);

    return [ [ departureText, formatWallMinutes(base + hops * 3) ] ];
};

/**
 * Loads everything TripDetail renders: the trip (scheduled departure/arrival), the pass time
 * at each station and, when the train is close, its approximate position.
 *
 * @returns {object} `{ status, trip, stationIds, titles, passTexts, progress, source, fetchedAt,
 *                     live, segmentName, nowMs, retry }`
 */
export default function useTripDetail({ origin, destination, segmentsList, holidaysList, departure }) {
    const previewMode = PREVIEW_MODES.indexOf(getUIPreviewMode()) > -1;
    const requestRef  = useRef(0);

    const [ status,      setStatus ]      = useState('loading');
    const [ trip,        setTrip ]        = useState(null);
    const [ titles,      setTitles ]      = useState(FALLBACK_STATION_TITLES);
    const [ passTexts,   setPassTexts ]   = useState({});
    const [ progress,    setProgress ]    = useState({ done: 0, total: 0 });
    const [ source,      setSource ]      = useState(SOURCE.SCHEDULED);
    const [ fetchedAt,   setFetchedAt ]   = useState(null);
    const [ live,        setLive ]        = useState(null);
    const [ segmentName, setSegmentName ] = useState(null);
    const [ nowMs,       setNowMs ]       = useState(Date.now());
    const [ attempt,     setAttempt ]     = useState(0);

    const originId      = parseInt(origin?.id, 10);
    const destinationId = parseInt(destination?.id, 10);
    const stationIds    = stationIdsBetween(originId, destinationId);

    useEffect(() => {
        const handle = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);

        return () => clearInterval(handle);
    }, []);

    const retry = useCallback(() => setAttempt(value => value + 1), []);

    useEffect(() => {
        const requestId   = ++requestRef.current;
        const isCancelled = () => requestId !== requestRef.current;

        setStatus('loading');
        setTrip(null);
        setPassTexts({});
        setLive(null);
        setProgress({ done: 0, total: 0 });

        loadTripDetail(isCancelled);

        return () => { requestRef.current++; };
    }, [ originId, destinationId, departure, attempt ]);

    async function fetchOptions(segment, fromId, toId, previewDepartureText) {
        const result = await fetchScheduleOptions(segment, fromId, toId);

        if (result?.options || !previewMode || !previewDepartureText) { return result; }

        return { options: buildPreviewOptions(fromId, toId, previewDepartureText), source: SOURCE.SCHEDULED };
    }

    async function resolveTrip(now) {
        const segments    = segmentsList && Object.keys(segmentsList).length > 0 ? segmentsList : DEFAULT_SEGMENTS_LIST;
        const requestedMs = Number.isFinite(departure) ? departure : (departure ? Number(departure) : NaN);
        const offsets     = Number.isFinite(requestedMs) ? [ argentinaDayOffset(now, requestedMs) ] : [ 0, 1 ];
        const previewText = previewMode ? wallTextOf(now.add(6, 'minute')) : null;

        for (const dayOffset of offsets) {
            const day     = atArgentinaWallTime(now, dayOffset, 12, 0);
            const segment = findTargetSegmentId(day, segments, holidaysList);

            if (!segment) { continue; }

            const result = await fetchOptions(segment, originId, destinationId, previewText);

            if (!result?.options) { return { error: true }; }

            const trips = buildTrips(now, dayOffset, result.options, { onlyUpcoming: false });
            const found = pickTrip(trips, { requestedMs, nowMs: now.valueOf() });

            if (found) {
                const index = trips.indexOf(found);

                return { trip: found, nextTrip: trips[index + 1] || null, segment, segmentName: segments[segment], result };
            }
        }

        return { trip: null };
    }

    async function loadPassTimes(segment, departureText, isCancelled) {
        const intermediateIds = stationIds.slice(1, -1);
        let   done            = 0;

        setProgress({ done: 0, total: intermediateIds.length });

        const tasks = intermediateIds.map(stationId => async () => {
            const result = await fetchOptions(segment, originId, stationId, departureText);
            const text   = findArrivalByDeparture(result?.options, departureText);

            if (isCancelled()) { return; }

            done++;
            setPassTexts(previous => ({ ...previous, [stationId]: text || null }));
            setProgress({ done, total: intermediateIds.length });
        });

        await runWithConcurrency(tasks, SCHEDULE_CONCURRENCY, isCancelled);
    }

    // Budget: 3 upstream schedule JSONs (cached) + at most 3 live requests
    // (station list, origin board, one confirmation board).
    async function loadLivePosition({ segment, trip, nextTrip, stationTitles, isCancelled }) {
        const departureText = wallTextOf(trip.departure);
        const upstreamIds   = upstreamStationIds(originId, destinationId);

        if (upstreamIds.length === 0) { return; }

        const upstreamTexts = {};

        await runWithConcurrency(upstreamIds.map(stationId => async () => {
            const result = await fetchOptions(segment, stationId, originId, null);
            upstreamTexts[stationId] = findDepartureByArrival(result?.options, departureText);
        }), SCHEDULE_CONCURRENCY, isCancelled);

        if (isCancelled()) { return; }

        const deltas = upstreamDeltas(upstreamIds, upstreamTexts, departureText);

        if (previewMode) {
            const position = inferTrainPosition({ originEtaMinutes: 6, originId, deltas });
            setLive({ position, deltas, originEtaMinutes: 6, liveDeparture: trip.departure, confirmed: false, fetchedAt: Date.now() });
            return;
        }

        const now              = nowInArgentina();
        const liveStationsList = await fetchLiveStationsList();
        const originIndex      = findLiveStationIndex(liveStationsList, stationTitles[originId]);
        const destinationIndex = findLiveStationIndex(liveStationsList, stationTitles[destinationId]);

        if (isCancelled() || originIndex < 0 || destinationIndex < 0 || originIndex === destinationIndex) { return; }

        const rows          = await fetchLiveRows(liveStationsList, originIndex, destinationIndex);
        const liveDeparture = pickLiveDeparture({
            rows,
            liveStationsList,
            originIndex,
            destinationIndex,
            scheduledDeparture: trip.departure,
            followingDeparture: nextTrip?.departure || null,
            now
        });

        if (isCancelled() || !liveDeparture) { return; }

        const originEtaMinutes = Math.max(0, Math.round((liveDeparture.valueOf() - now.valueOf()) / 60000));
        const position         = inferTrainPosition({ originEtaMinutes, originId, deltas });
        let   confirmed        = false;

        if (position?.kind === 'between' && position.aheadId !== originId) {
            const aheadIndex = findLiveStationIndex(liveStationsList, stationTitles[position.aheadId]);
            const aheadDelta = deltas.find(delta => delta.id === position.aheadId)?.minutesToOrigin;

            if (aheadIndex > -1 && Number.isFinite(aheadDelta)) {
                try {
                    const aheadRows = await fetchLiveRows(liveStationsList, aheadIndex, destinationIndex);
                    confirmed = Boolean(findConfirmingRow(aheadRows, originEtaMinutes - aheadDelta));
                } catch (exception) {
                    console.warn('TripDetail: confirmation board unavailable:', exception);
                }
            }
        }

        if (isCancelled()) { return; }

        setLive({ position, deltas, originEtaMinutes, liveDeparture, confirmed, fetchedAt: Date.now() });
        setSource(SOURCE.LIVE);
        setFetchedAt(Date.now());
    }

    async function loadTripDetail(isCancelled) {
        if (Number.isNaN(originId) || Number.isNaN(destinationId) || originId === destinationId) {
            setStatus('error');
            return;
        }

        try {
            const [ stationTitles, resolved ] = await Promise.all([ loadStationTitles(), resolveTrip(nowInArgentina()) ]);

            if (isCancelled()) { return; }

            setTitles(stationTitles);

            if (resolved.error || !resolved.trip) {
                setStatus(resolved.error ? 'error' : 'empty');
                return;
            }

            const { trip, nextTrip, segment, result } = resolved;
            const url = scheduleUrl(segment, originId, destinationId);

            setTrip(trip);
            setSegmentName(resolved.segmentName || null);
            setSource(result.source);
            setFetchedAt(result.source === SOURCE.OFFLINE ? await Cache.getFetchedAt(url) : Date.now());
            setStatus('ready');

            // The Ferrovías board is plain HTTP without CORS: never attempted on web (the UI
            // preview shows a canned estimate instead so the layout can be reviewed).
            const livePromise = previewMode || (Platform.OS !== 'web' && isLivePositionApplicable(trip, Date.now()))
                ? loadLivePosition({ segment, trip, nextTrip, stationTitles, isCancelled }).catch(exception => {
                    // Live boards fail often (timeouts, markup changes, CORS on web): hide the estimate.
                    console.warn('TripDetail: live position unavailable:', exception);
                })
                : Promise.resolve();

            await Promise.all([ loadPassTimes(segment, wallTextOf(trip.departure), isCancelled), livePromise ]);
        } catch (exception) {
            console.warn('TripDetail: couldn\'t load trip:', exception);

            if (!isCancelled()) { setStatus('error'); }
        }
    }

    return { status, trip, stationIds, titles, passTexts, progress, source, fetchedAt, live, segmentName, nowMs, retry, previewMode };
}

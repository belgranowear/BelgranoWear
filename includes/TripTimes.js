// Pure helpers for F4 "Viaje completo": per-station pass times, trip summary and the
// approximate train position inferred from live ETAs. No React / network code lives here
// so the logic can be reasoned about (and sanity-checked) in isolation.
//
// Schedule rows look like `[ "HH:mm departure", "HH:mm arrival" ]` (older rows: bare "HH:mm").
// Times are Argentina wall-clock strings; instants are dayjs objects (utc plugin loaded by
// includes/Time.js) kept at the Argentina offset.

import { ARGENTINA_UTC_OFFSET_MINUTES } from './Time';

export const FIRST_STATION_ID          = 1;
export const LAST_STATION_ID           = 23;
export const FALLBACK_MINUTES_PER_STOP = 3;
export const UPSTREAM_STATIONS_COUNT   = 3;
// Live position is only attempted for departures this close (minutes) to now.
export const LIVE_POSITION_WINDOW_MIN  = 30;
// A live row at the station ahead "confirms" the estimate when it is this close (minutes).
export const LIVE_CONFIRM_TOLERANCE_MIN = 3;

const MINUTES_PER_DAY = 24 * 60;

// "HH:mm" → minutes after midnight, or null.
export const wallMinutes = text => {
    const match = /^\s*(\d{1,2}):(\d{2})/.exec(String(text || ''));

    if (!match) { return null; }

    const hour   = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);

    return hour > 47 || minute > 59 ? null : hour * 60 + minute;
};

export const formatWallMinutes = minutes => {
    const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

    return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};

export const rowDepartureText = row => (Array.isArray(row) ? row[0] : row) || null;
export const rowArrivalText   = row => (Array.isArray(row) && row.length > 1 ? row[1] : null) || null;

// Arrival column of the row (of `options`) whose departure equals `departureText`.
export const findArrivalByDeparture = (options, departureText) => {
    const wanted = wallMinutes(departureText);

    if (wanted === null || !Array.isArray(options)) { return null; }

    const row = options.find(option => wallMinutes(rowDepartureText(option)) === wanted);

    return row ? rowArrivalText(row) : null;
};

// Departure column of the row (of `options`) whose arrival equals `arrivalText`.
export const findDepartureByArrival = (options, arrivalText) => {
    const wanted = wallMinutes(arrivalText);

    if (wanted === null || !Array.isArray(options)) { return null; }

    const row = options.find(option => wallMinutes(rowArrivalText(option)) === wanted);

    return row ? rowDepartureText(row) : null;
};

// Minutes from `fromText` forward to `toText`, wrapping past midnight (0…1439).
export const forwardMinutesBetween = (fromText, toText) => {
    const from = wallMinutes(fromText);
    const to   = wallMinutes(toText);

    if (from === null || to === null) { return null; }

    return ((to - from) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
};

// Instant of wall time `text` placed relative to `anchor` (a dayjs instant whose wall time
// is `anchorText`): forward (`direction` 1, e.g. pass times after the departure) or backward
// (`direction` -1, e.g. upstream stations before the origin).
export const instantFromAnchor = (anchor, anchorText, text, direction = 1) => {
    if (!anchor || !text) { return null; }

    const forward = forwardMinutesBetween(anchorText, text);

    if (forward === null) { return null; }

    const offset = direction >= 0 ? forward : -(forward === 0 ? 0 : MINUTES_PER_DAY - forward);

    return anchor.add(offset, 'minute');
};

export const wallTextOf = instant => {
    if (!instant) { return null; }

    const local = instant.utcOffset(ARGENTINA_UTC_OFFSET_MINUTES);

    return `${String(local.hour()).padStart(2, '0')}:${String(local.minute()).padStart(2, '0')}`;
};

// Picks the trip from `trips` (`[{departure, arrival}]`, sorted) closest to `requestedMs`,
// or the first one at/after `nowMs` when no departure was requested.
export const pickTrip = (trips, { requestedMs, nowMs }) => {
    if (!Array.isArray(trips) || trips.length === 0) { return null; }

    if (Number.isFinite(requestedMs)) {
        return trips.reduce((best, trip) => (
            Math.abs(trip.departure.valueOf() - requestedMs) < Math.abs(best.departure.valueOf() - requestedMs) ? trip : best
        ), trips[0]);
    }

    return trips.find(trip => trip.departure.valueOf() >= nowMs) || null;
};

// Station ids upstream of the origin (where the train comes from), nearest first.
export const upstreamStationIds = (originId, destinationId, count = UPSTREAM_STATIONS_COUNT) => {
    const origin      = parseInt(originId, 10);
    const destination = parseInt(destinationId, 10);
    const step        = destination < origin ? 1 : -1;
    const ids         = [];

    if (Number.isNaN(origin) || Number.isNaN(destination) || origin === destination) { return ids; }

    for (let id = origin + step; ids.length < count && id >= FIRST_STATION_ID && id <= LAST_STATION_ID; id += step) {
        ids.push(id);
    }

    return ids;
};

/**
 * Builds the timeline rows.
 *
 * @param {object}   args
 * @param {number[]} args.stationIds    Origin … destination, in travel order.
 * @param {object}   args.titles        id → title.
 * @param {object}   args.trip          `{ departure, arrival }` dayjs instants (arrival may be null).
 * @param {object}   args.passTexts     id → "HH:mm" (found) | null (missing) | undefined (loading).
 * @param {number}   args.nowMs
 * @returns {Array<{id:number,title:string,role:string,time:object|null,timeText:string|null,state:string,isPast:boolean}>}
 */
export const buildStops = ({ stationIds, titles, trip, passTexts = {}, nowMs }) => {
    if (!trip || !Array.isArray(stationIds) || stationIds.length === 0) { return []; }

    const departureText = wallTextOf(trip.departure);
    const lastIndex     = stationIds.length - 1;

    return stationIds.map((id, index) => {
        const role = index === 0 ? 'origin' : (index === lastIndex ? 'destination' : 'intermediate');
        let   time = null;
        let   state = 'ok';

        if (role === 'origin') {
            time = trip.departure;
        } else if (role === 'destination') {
            time  = trip.arrival || null;
            state = time ? 'ok' : 'missing';
        } else if (typeof(passTexts[id]) === 'undefined') {
            state = 'loading';
        } else if (passTexts[id] === null) {
            state = 'missing';
        } else {
            time = instantFromAnchor(trip.departure, departureText, passTexts[id], 1);
            state = time ? 'ok' : 'missing';
        }

        return {
            id,
            title:    titles?.[id] || String(id),
            role,
            time,
            timeText: time ? wallTextOf(time) : null,
            state,
            isPast:   Boolean(time) && Number.isFinite(nowMs) && time.valueOf() < nowMs
        };
    });
};

// `{ durationMinutes, stopsCount }`: stops after the origin, destination included.
export const summarizeTrip = (trip, stationIds) => ({
    durationMinutes: trip?.arrival && trip?.departure
        ? Math.max(0, Math.round((trip.arrival.valueOf() - trip.departure.valueOf()) / 60000))
        : null,
    stopsCount: Math.max(0, (stationIds?.length || 0) - 1)
});

export const tripPhase = (trip, nowMs) => {
    if (!trip) { return 'unknown'; }
    if (nowMs < trip.departure.valueOf()) { return 'upcoming'; }
    if (trip.arrival && nowMs >= trip.arrival.valueOf()) { return 'finished'; }

    return 'inProgress';
};

export const isLivePositionApplicable = (trip, nowMs, windowMinutes = LIVE_POSITION_WINDOW_MIN) => {
    if (!trip) { return false; }

    const minutesToDeparture = (trip.departure.valueOf() - nowMs) / 60000;

    return minutesToDeparture >= -1 && minutesToDeparture <= windowMinutes;
};

// Minutes each upstream station is from the origin for this trip, nearest first.
// `upstreamDepartureTexts`: id → "HH:mm" departure at that station of the same train
// (null/undefined when unknown) — falls back to FALLBACK_MINUTES_PER_STOP per hop.
export const upstreamDeltas = (upstreamIds, upstreamDepartureTexts, originDepartureText) => {
    let previous = 0;

    return upstreamIds.map((id, index) => {
        const text   = upstreamDepartureTexts?.[id];
        const actual = text ? forwardMinutesBetween(text, originDepartureText) : null;
        // Ignore implausible values (wrong row / day wrap) and keep the deltas monotonic.
        const valid  = actual !== null && actual > previous && actual <= (index + 1) * 10;
        const delta  = valid ? actual : previous + FALLBACK_MINUTES_PER_STOP;

        previous = delta;

        return { id, minutesToOrigin: delta, scheduled: valid, departureText: valid ? text : null };
    });
};

/**
 * Infers where the train is from its live ETA at the origin.
 *
 * @param {number} originEtaMinutes   Live minutes until the train leaves the origin.
 * @param {Array<{id:number,minutesToOrigin:number}>} deltas  From `upstreamDeltas`.
 * @returns {{ kind:'arriving'|'between'|'beyond', behindId:number|null, aheadId:number|null }|null}
 *   `behindId`: last station the train already passed (upstream); `aheadId`: next station it
 *   reaches (the origin id is passed in `originId`). `beyond`: further than the last delta.
 */
export const inferTrainPosition = ({ originEtaMinutes, originId, deltas }) => {
    if (!Number.isFinite(originEtaMinutes) || originEtaMinutes < 0) { return null; }

    if (originEtaMinutes <= 1 || !deltas || deltas.length === 0) {
        return { kind: 'arriving', behindId: deltas?.[0]?.id ?? null, aheadId: originId };
    }

    for (let index = 0; index < deltas.length; index++) {
        if (deltas[index].minutesToOrigin >= originEtaMinutes) {
            return {
                kind:     'between',
                behindId: deltas[index].id,
                aheadId:  index === 0 ? originId : deltas[index - 1].id
            };
        }
    }

    return { kind: 'beyond', behindId: null, aheadId: deltas[deltas.length - 1].id };
};

// Live row at the station ahead consistent with the estimate (same train), or null.
export const findConfirmingRow = (rows, expectedMinutes, tolerance = LIVE_CONFIRM_TOLERANCE_MIN) => {
    if (!Array.isArray(rows) || !Number.isFinite(expectedMinutes)) { return null; }

    let best = null;

    rows.forEach(row => {
        const difference = Math.abs(row.minutes - expectedMinutes);

        if (difference <= tolerance && (!best || difference < Math.abs(best.minutes - expectedMinutes))) { best = row; }
    });

    return best;
};

// Runs `tasks` (functions returning promises) with at most `limit` in flight.
export const runWithConcurrency = async (tasks, limit, isCancelled = () => false) => {
    let cursor = 0;

    const worker = async () => {
        while (cursor < tasks.length && !isCancelled()) {
            const task = tasks[cursor++];

            try { await task(); } catch (exception) { console.warn('TripTimes: task failed:', exception); }
        }
    };

    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
};

export default {
    wallMinutes,
    formatWallMinutes,
    findArrivalByDeparture,
    findDepartureByArrival,
    instantFromAnchor,
    pickTrip,
    upstreamStationIds,
    buildStops,
    summarizeTrip,
    tripPhase,
    isLivePositionApplicable,
    upstreamDeltas,
    inferTrainPosition,
    findConfirmingRow,
    runWithConcurrency
};

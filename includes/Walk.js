// F2 "¿Llego?" walking estimate helpers. Pure module: no React Native imports, safe to
// unit test with plain Node. Distance is straight-line (haversine) × WALK_DETOUR_FACTOR at
// WALK_SPEED_KMH; the UI must always label the result as "aprox.".

export const WALK_SPEED_KMH     = 4.5;
export const WALK_DETOUR_FACTOR = 1.3;

// Minutes subtracted on top of the walk when computing `leaveAt` (lock the door, cross the platform).
export const WALK_LEAVE_BUFFER_MINUTES = 1;

// Slack (minutes between arriving on foot and the departure) at or above which the trip is ON_TIME.
export const WALK_TIGHT_THRESHOLD_MINUTES = 3;

// Beyond this straight-line distance the user is clearly not walking to the station; the card hides.
export const WALK_MAX_DISTANCE_METERS = 8000;

export const WALK_STATUS = {
    ON_TIME: 'onTime',
    TIGHT:   'tight',
    MISSED:  'missed'
};

const EARTH_RADIUS_METERS = 6371008.8;
const MS_PER_MINUTE       = 60 * 1000;

const toRadians = degrees => (degrees * Math.PI) / 180;

const isCoordinate = (value, limit) => typeof(value) === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

/**
 * Normalizes a point into `{ latitude, longitude }`. Accepts the shapes used across the app:
 * `{ latitude, longitude }` (expo-location coords), `{ coords: { latitude, longitude } }`
 * (expo-location LocationObject) and the station JSON shapes `{ lat, lon }` /
 * `{ center: { lat, lon } }` (see DestinationPicker). Numeric strings are accepted.
 *
 * @param {object} point
 * @returns {{latitude:number,longitude:number}|null}
 */
export const getCoordinates = point => {
    if (!point || typeof(point) !== 'object') { return null; }

    const source    = point.coords || point;
    const latitude  = parseFloat(source.latitude  ?? source.lat ?? source.center?.lat);
    const longitude = parseFloat(source.longitude ?? source.lon ?? source.lng ?? source.center?.lon);

    if (!isCoordinate(latitude, 90) || !isCoordinate(longitude, 180)) { return null; }

    return { latitude, longitude };
};

/**
 * Great-circle (haversine) distance in meters.
 *
 * @param {object} from  Any shape accepted by getCoordinates().
 * @param {object} to    Any shape accepted by getCoordinates().
 * @returns {number} Meters, or NaN when coordinates are missing.
 */
export const distanceMeters = (from, to) => {
    const a = getCoordinates(from);
    const b = getCoordinates(to);

    if (!a || !b) { return NaN; }

    const deltaLatitude  = toRadians(b.latitude  - a.latitude);
    const deltaLongitude = toRadians(b.longitude - a.longitude);
    const h = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(deltaLongitude / 2) ** 2;

    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * Converts a straight-line distance into approximate walking minutes (rounded up).
 *
 * @param {number} meters
 * @returns {number} Minutes, or NaN for invalid input.
 */
export const walkMinutesForDistance = meters => {
    if (typeof(meters) !== 'number' || !Number.isFinite(meters) || meters < 0) { return NaN; }

    return Math.ceil(((meters / 1000) * WALK_DETOUR_FACTOR / WALK_SPEED_KMH) * 60);
};

/**
 * @param {{latitude:number,longitude:number}} from  (also accepts the shapes of getCoordinates()).
 * @param {{latitude:number,longitude:number}} to
 * @returns {number} Approximate walking minutes, or NaN when coordinates are missing.
 */
export const estimateWalkMinutes = (from, to) => walkMinutesForDistance(distanceMeters(from, to));

const toMs = value => {
    if (value === null || typeof(value) === 'undefined') { return NaN; }

    const ms = typeof(value) === 'number' ? value : Number(value.valueOf());

    return Number.isFinite(ms) ? ms : NaN;
};

const subtractMinutes = (instant, minutes) => {
    if (instant && typeof(instant.subtract) === 'function') { return instant.subtract(minutes, 'minute'); }

    return new Date(toMs(instant) - (minutes * MS_PER_MINUTE));
};

/**
 * Classifies whether the user makes it on foot.
 *
 * - `slackMinutes` = minutes until departure − walkMinutes (floored; negative when late).
 * - ON_TIME when slack ≥ 3, TIGHT when 0 ≤ slack < 3, MISSED when slack < 0.
 * - `leaveAt` = departure − walkMinutes − 1 min buffer, same type as `departure`
 *   (dayjs in → dayjs out, keeping its UTC offset; Date otherwise).
 * - Invalid input (NaN walk, missing instants) returns `{ status: null, slackMinutes: NaN, leaveAt: null }`.
 *
 * @param {number} walkMinutes
 * @param {object} departure  dayjs instant (Date / epoch ms also accepted).
 * @param {object} now        dayjs instant (Date / epoch ms also accepted).
 * @returns {{ status: string|null, slackMinutes: number, leaveAt: object|null }}
 */
export const classifyWalk = (walkMinutes, departure, now) => {
    const departureMs = toMs(departure);
    const nowMs       = toMs(now);

    if (typeof(walkMinutes) !== 'number' || !Number.isFinite(walkMinutes) || Number.isNaN(departureMs) || Number.isNaN(nowMs)) {
        return { status: null, slackMinutes: NaN, leaveAt: null };
    }

    const slackMinutes = Math.floor(((departureMs - nowMs) / MS_PER_MINUTE) - walkMinutes);
    const status = slackMinutes >= WALK_TIGHT_THRESHOLD_MINUTES
        ? WALK_STATUS.ON_TIME
        : (slackMinutes >= 0 ? WALK_STATUS.TIGHT : WALK_STATUS.MISSED);

    return {
        status,
        slackMinutes,
        leaveAt: subtractMinutes(departure, walkMinutes + WALK_LEAVE_BUFFER_MINUTES)
    };
};

/**
 * Whole minutes from `now` until `instant` (floored, may be negative). NaN on invalid input.
 *
 * @param {object} instant dayjs / Date / epoch ms.
 * @param {object} now     dayjs / Date / epoch ms.
 * @returns {number}
 */
export const minutesUntil = (instant, now) => Math.floor((toMs(instant) - toMs(now)) / MS_PER_MINUTE);

/**
 * Human distance: "650 m" (rounded to 10 m, 50 m above 500 m) or "1,2 km" / "1.2 km".
 *
 * @param {number} meters
 * @param {string} [locale='es']  Any locale starting with "en" uses a decimal point.
 * @returns {string} Empty string for invalid input.
 */
export const formatDistance = (meters, locale = 'es') => {
    if (typeof(meters) !== 'number' || !Number.isFinite(meters) || meters < 0) { return ''; }

    if (meters < 950) {
        const step = meters < 500 ? 10 : 50;

        return `${Math.max(step, Math.round(meters / step) * step)} m`;
    }

    const kilometers = (Math.round(meters / 100) / 10).toFixed(1);
    const separator  = String(locale || '').toLowerCase().startsWith('en') ? '.' : ',';

    return `${kilometers.replace('.', separator)} km`;
};

export default {
    WALK_SPEED_KMH,
    WALK_DETOUR_FACTOR,
    WALK_LEAVE_BUFFER_MINUTES,
    WALK_TIGHT_THRESHOLD_MINUTES,
    WALK_MAX_DISTANCE_METERS,
    WALK_STATUS,
    getCoordinates,
    distanceMeters,
    walkMinutesForDistance,
    estimateWalkMinutes,
    classifyWalk,
    minutesUntil,
    formatDistance
};

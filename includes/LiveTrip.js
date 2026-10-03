// F1 trip tracking ("Seguir viaje"): ongoing notification / Live Update on phone (Ongoing
// Activity on Wear OS hangs off the same native state), backed by the native
// `BelgranoLiveTrip` module (plugins/withBelgranoLiveTrip.js). All methods resolve to
// `false`/`null` when tracking is unavailable (web, iOS, Expo Go / missing native module).
//
// Notification strings are built and localized here; native only lays them out. While JS is
// alive the notification text ("en N min") is refreshed every minute; the countdown chip is a
// native chronometer and keeps ticking on its own.
import { DeviceEventEmitter, Platform } from 'react-native';

import dayjs from 'dayjs';
import utc   from 'dayjs/plugin/utc';

import Lang from './Lang';
import { ARGENTINA_UTC_OFFSET_MINUTES } from './Time';
import { getLiveTripModule, toMillis } from './TripSnapshot';

dayjs.extend(utc);

export const LIVE_TRIP_EVENT = 'belgranoLiveTrip';

const REFRESH_INTERVAL_MS = 60 * 1000;
const MINUTE_MS           = 60 * 1000;

let activeTrip     = null;
let refreshTimer   = null;
let operationQueue = Promise.resolve();

// Runs native operations one at a time so a quick start → stop can't finish out of order.
const serialize = task => {
    const next = operationQueue.catch(() => {}).then(task);

    operationQueue = next.catch(() => {});

    return next;
};

const isAvailable = () => {
    const nativeModule = getLiveTripModule();

    if (!nativeModule) { return false; }

    if (nativeModule.isAvailable === true) { return true; }

    try {
        return nativeModule.getConstants?.()?.isAvailable === true;
    } catch (exception) {
        return false;
    }
};

const formatTime = epochMs => dayjs(epochMs).utcOffset(ARGENTINA_UTC_OFFSET_MINUTES).format('HH:mm');

const minutesUntil = (epochMs, now) => Math.max(0, Math.ceil((epochMs - now) / MINUTE_MS));

const sourceLabel = source => {
    switch (source) {
        case 'live':    return Lang.t('liveSourceLive');
        case 'offline': return Lang.t('liveSourceOffline');
        default:        return Lang.t('liveSourceScheduled');
    }
};

const normalizeTrip = trip => ({
    origin:      trip.origin ? { id: trip.origin.id ?? null, title: trip.origin.title ?? '' } : null,
    destination: trip.destination ? { id: trip.destination.id ?? null, title: trip.destination.title ?? '' } : null,
    departure:   toMillis(trip.departure),
    arrival:     toMillis(trip.arrival),
    source:      trip.source || 'scheduled',
    nextStation: trip.nextStation ?? null
});

// Native payload (see LiveTripNotifier.kt): the trip plus every visible string.
export const buildTrackingPayload = (trip, now = Date.now()) => {
    const time      = formatTime(trip.departure);
    const parts     = [];
    let   shortText = null;

    if (trip.departure > now - 30 * 1000) {
        const minutes = minutesUntil(trip.departure, now);

        parts.push(minutes > 0
            ? Lang.t('liveTripDepartsIn', { time, minutes })
            : Lang.t('liveTripDepartsNow', { time }));
        shortText = minutes > 0 ? Lang.t('liveTripShortMinutes', { minutes }) : Lang.t('liveTripShortNow');
    } else {
        parts.push(Lang.t('liveTripDeparted', { time }));

        if (trip.arrival && trip.arrival > now) {
            shortText = Lang.t('liveTripShortMinutes', { minutes: minutesUntil(trip.arrival, now) });
        }
    }

    if (trip.arrival) { parts.push(Lang.t('liveTripArrives', { time: formatTime(trip.arrival) })); }

    const subTextParts = [ sourceLabel(trip.source) ];

    if (trip.nextStation) { subTextParts.push(Lang.t('liveTripNextStation', { station: trip.nextStation })); }

    return {
        trip,
        title: Lang.t('liveTripTitle', {
            origin:      trip.origin?.title ?? '',
            destination: trip.destination?.title ?? ''
        }),
        text:      parts.join(' · '),
        subText:   subTextParts.join(' · '),
        shortText,
        labels: {
            stop:               Lang.t('liveTripStop'),
            open:               Lang.t('liveTripOpen'),
            channelName:        Lang.t('liveTripChannelName'),
            channelDescription: Lang.t('liveTripChannelDescription')
        },
        updatedAt: now
    };
};

// Resolves to true unless the user denied notifications (native re-checks it anyway).
const ensureNotificationPermission = async () => {
    try {
        const Notifications = await import('expo-notifications');
        let permissions = await Notifications.getPermissionsAsync();

        if (!permissions.granted && permissions.canAskAgain !== false) {
            permissions = await Notifications.requestPermissionsAsync();
        }

        return permissions.granted === true;
    } catch (exception) {
        console.warn('LiveTrip: couldn\'t check notification permission:', exception);
        return true;
    }
};

const stopRefreshTimer = () => {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
};

const startRefreshTimer = () => {
    stopRefreshTimer();

    refreshTimer = setInterval(() => {
        if (!activeTrip) {
            stopRefreshTimer();
            return;
        }

        serialize(() => sendTracking('updateTracking', activeTrip)).then(ok => {
            if (!ok) {
                activeTrip = null;
                stopRefreshTimer();
            }
        });
    }, REFRESH_INTERVAL_MS);
};

async function sendTracking(method, trip) {
    const nativeModule = getLiveTripModule();

    if (!nativeModule) { return false; }

    try {
        return await nativeModule[method](JSON.stringify(buildTrackingPayload(trip))) === true;
    } catch (exception) {
        console.warn(`LiveTrip: ${method} failed:`, exception);
        return false;
    }
}

async function readActive() {
    const nativeModule = getLiveTripModule();

    if (!nativeModule) { return null; }

    try {
        const json = await nativeModule.getActive();
        const trip = json ? JSON.parse(json)?.trip ?? null : null;

        activeTrip = trip;

        if (!trip) { stopRefreshTimer(); }

        return trip ? { ...trip } : null;
    } catch (exception) {
        console.warn('LiveTrip: couldn\'t read the active trip:', exception);
        return null;
    }
}

const LiveTrip = {
    /** @returns {boolean} */
    isAvailable,

    /**
     * @param {object} trip `{ origin:{id,title}, destination:{id,title}, departure:number(ms), arrival:number|null, source }`
     *   (optional `nextStation` string)
     * @returns {Promise<boolean>}
     */
    start: async trip => {
        if (!isAvailable() || !trip) { return false; }

        const normalized = normalizeTrip(trip);

        if (normalized.departure === null) { return false; }

        if (!await ensureNotificationPermission()) { return false; }

        return serialize(async () => {
            const ok = await sendTracking('startTracking', normalized);

            if (ok) {
                activeTrip = normalized;
                startRefreshTimer();
            }

            return ok;
        });
    },

    /**
     * @param {object} patch Same shape as `start`, partial (e.g. a new live departure).
     * @returns {Promise<boolean>}
     */
    update: async patch => {
        if (!isAvailable()) { return false; }

        return serialize(async () => {
            const base = activeTrip || await readActive();

            if (!base) { return false; }

            const merged = normalizeTrip({ ...base, ...(patch || {}) });

            if (merged.departure === null) { return false; }

            const ok = await sendTracking('updateTracking', merged);

            if (ok) {
                activeTrip = merged;
                if (!refreshTimer) { startRefreshTimer(); }
            } else {
                // Native has no active trip any more (stopped from the notification or expired).
                await readActive();
            }

            return ok;
        });
    },

    /** @returns {Promise<boolean>} */
    stop: async () => {
        if (!isAvailable()) { return false; }

        return serialize(async () => {
            stopRefreshTimer();
            activeTrip = null;

            try {
                return await getLiveTripModule().stopTracking() === true;
            } catch (exception) {
                console.warn('LiveTrip: stopTracking failed:', exception);
                return false;
            }
        });
    },

    /** @returns {Promise<object|null>} The trip currently tracked, if any (read from native). */
    getActive: async () => {
        if (!isAvailable()) { return null; }

        return serialize(readActive);
    },

    /**
     * Additive helper: `listener({ active })` is called when tracking changes natively (e.g. the
     * user tapped "Dejar de seguir" in the notification). Returns an unsubscribe function.
     */
    subscribe: listener => {
        if (Platform.OS !== 'android' || !getLiveTripModule()) { return () => {}; }

        const subscription = DeviceEventEmitter.addListener(LIVE_TRIP_EVENT, event => {
            if (!event?.active) {
                activeTrip = null;
                stopRefreshTimer();
            }

            listener?.(event);
        });

        return () => subscription.remove();
    }
};

export default LiveTrip;

// Publishes the "next trains" snapshot read by native surfaces (phone widgets, Wear OS
// tile and complications, ongoing notification). Format is documented in
// plugins/README-native.md. No-op (resolves `false`) on web, iOS and wherever the native
// `BelgranoLiveTrip` module is missing (Expo Go).
//
// Additive field written here: `labels` — localized strings for native readers
// (`nextTrain`, `live`, `scheduled`, `offline`, `inMinutes`, `now`, `agoSeconds`,
// `agoMinutes`, `openApp`, `noMoreTrains`, `separator`, `locale`); `{n}` is replaced natively.
// The `tracking` block is overwritten natively with the trip actually being tracked.
import { NativeModules, Platform } from 'react-native';

import Lang from './Lang';

const MAX_DEPARTURES    = 5;
const PAST_TOLERANCE_MS = 60 * 1000;

let lastPublishedJson = null;

export const getLiveTripModule = () => (
    Platform.OS === 'android' ? NativeModules.BelgranoLiveTrip || null : null
);

// Accepts epoch ms, Date, dayjs or numeric strings; returns integer ms or null.
export const toMillis = value => {
    if (value === null || value === undefined || value === '') { return null; }

    const number = typeof value === 'number' ? value : Number(value.valueOf());

    return Number.isFinite(number) ? Math.round(number) : null;
};

const normalizeStation = station => (
    station ? { id: station.id ?? null, title: station.title ?? '' } : null
);

export const buildSnapshotLabels = () => ({
    nextTrain:    Lang.t('liveWidgetNextTrain'),
    live:         Lang.t('liveSourceLive'),
    scheduled:    Lang.t('liveSourceScheduled'),
    offline:      Lang.t('liveSourceOffline'),
    inMinutes:    Lang.t('liveWidgetInMinutes'),
    now:          Lang.t('liveWidgetNow'),
    agoSeconds:   Lang.t('liveWidgetAgoSeconds'),
    agoMinutes:   Lang.t('liveWidgetAgoMinutes'),
    openApp:      Lang.t('liveWidgetOpenApp'),
    noMoreTrains: Lang.t('liveWidgetNoMoreTrains'),
    separator:    ' · ',
    locale:       Lang.locale
});

export const normalizeSnapshot = (snapshot, now = Date.now()) => {
    const departures = (snapshot.departures || [])
        .map(item => ({
            departure: toMillis(item?.departure),
            arrival:   toMillis(item?.arrival),
            source:    item?.source || 'scheduled'
        }))
        .filter(item => item.departure !== null && item.departure >= now - PAST_TOLERANCE_MS)
        .sort((first, second) => first.departure - second.departure)
        .slice(0, MAX_DEPARTURES);

    const tracking = snapshot.tracking || {};

    return {
        ...snapshot,
        origin:      normalizeStation(snapshot.origin),
        destination: normalizeStation(snapshot.destination),
        departures,
        fetchedAt:   toMillis(snapshot.fetchedAt) ?? now,
        tracking: {
            active:      tracking.active === true,
            nextStation: tracking.nextStation ?? null,
            arrivalAt:   toMillis(tracking.arrivalAt)
        },
        labels: { ...buildSnapshotLabels(), ...(snapshot.labels || {}) }
    };
};

const TripSnapshot = {
    /**
     * @param {object} snapshot `{ origin:{id,title}, destination:{id,title},
     *   departures:[{ departure:number(ms), arrival:number|null, source }], fetchedAt:number(ms),
     *   tracking:{ active:boolean, nextStation:string|null, arrivalAt:number|null } }`
     * @returns {Promise<boolean>} Whether the snapshot was written.
     */
    publish: async snapshot => {
        const nativeModule = getLiveTripModule();

        if (!nativeModule || !snapshot) { return false; }

        try {
            const json = JSON.stringify(normalizeSnapshot(snapshot));

            if (json === lastPublishedJson) { return true; }

            const written = await nativeModule.publishSnapshot(json) === true;

            if (written) { lastPublishedJson = json; }

            return written;
        } catch (exception) {
            console.warn('TripSnapshot: couldn\'t publish snapshot:', exception);
            return false;
        }
    },

    /** @returns {Promise<boolean>} */
    clear: async () => {
        const nativeModule = getLiveTripModule();

        if (!nativeModule) { return false; }

        try {
            lastPublishedJson = null;
            return await nativeModule.clearSnapshot() === true;
        } catch (exception) {
            console.warn('TripSnapshot: couldn\'t clear snapshot:', exception);
            return false;
        }
    }
};

export default TripSnapshot;

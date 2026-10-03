// F1 trip tracking ("Seguir viaje"): ongoing notification / Live Update on phone and
// Ongoing Activity on Wear OS, backed by the native `BelgranoLiveTrip` module.
// Contract (stub: no-ops until implemented — owned by the live trip area). All methods
// resolve to `false` when tracking is unavailable (web, iOS, missing native module).

const LiveTrip = {
    /** @returns {boolean} */
    isAvailable: () => false,

    /**
     * @param {object} trip `{ origin:{id,title}, destination:{id,title}, departure:number(ms), arrival:number|null, source }`
     * @returns {Promise<boolean>}
     */
    start: async trip => false,

    /**
     * @param {object} patch Same shape as `start`, partial (e.g. a new live departure).
     * @returns {Promise<boolean>}
     */
    update: async patch => false,

    /** @returns {Promise<boolean>} */
    stop: async () => false,

    /** @returns {Promise<object|null>} The trip currently tracked, if any. */
    getActive: async () => null
};

export default LiveTrip;

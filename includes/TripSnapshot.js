// Publishes the "next trains" snapshot read by native surfaces (phone widgets, Wear OS
// tile and complications, ongoing notification). Format is documented in
// plugins/README-native.md. Contract (stub: no-op until implemented — owned by the live
// trip area). No-op on web and iOS.

const TripSnapshot = {
    /**
     * @param {object} snapshot `{ origin:{id,title}, destination:{id,title},
     *   departures:[{ departure:number(ms), arrival:number|null, source }], fetchedAt:number(ms),
     *   tracking:{ active:boolean, nextStation:string|null, arrivalAt:number|null } }`
     * @returns {Promise<boolean>} Whether the snapshot was written.
     */
    publish: async snapshot => false,

    /** @returns {Promise<boolean>} */
    clear: async () => false
};

export default TripSnapshot;

// F2 "¿Llego?" walking estimate helpers. Contract (stub — owned by the walk area).
// Distance is straight-line × WALK_DETOUR_FACTOR at WALK_SPEED_KMH; always shown as "aprox.".

export const WALK_SPEED_KMH     = 4.5;
export const WALK_DETOUR_FACTOR = 1.3;

export const WALK_STATUS = {
    ON_TIME: 'onTime',
    TIGHT:   'tight',
    MISSED:  'missed'
};

/**
 * @param {{latitude:number,longitude:number}} from
 * @param {{latitude:number,longitude:number}} to
 * @returns {number} Approximate walking minutes, or NaN when coordinates are missing.
 */
export const estimateWalkMinutes = (from, to) => NaN;

/**
 * @param {number} walkMinutes
 * @param {object} departure  dayjs instant.
 * @param {object} now        dayjs instant.
 * @returns {{ status: string, slackMinutes: number, leaveAt: object|null }}
 */
export const classifyWalk = (walkMinutes, departure, now) => ({ status: WALK_STATUS.MISSED, slackMinutes: NaN, leaveAt: null });

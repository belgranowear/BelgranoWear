import React from 'react';

import Lang from '../includes/Lang';

import { AppScreen, EmptyState } from './ui';

/**
 * F3: full day schedule for a route, grouped by hour, with segment selector and "Ahora".
 * Contract (stub screen — owned by the F3 full schedule area).
 *
 * Route params: `{ origin, destination, segmentsList, holidaysList, segmentId? }` (same as NextSchedule).
 */
export default function FullSchedule({ route, navigation }) {
    return (
        <AppScreen>
            <EmptyState title={Lang.t('screenFullScheduleName')} message="" />
        </AppScreen>
    );
}

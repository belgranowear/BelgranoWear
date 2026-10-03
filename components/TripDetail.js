import React from 'react';

import Lang from '../includes/Lang';

import { AppScreen, EmptyState } from './ui';

/**
 * F4: one trip end to end — departure, arrival, duration, stops and per-station times.
 * Contract (stub screen — owned by the F4 trip detail area).
 *
 * Route params: `{ origin, destination, segmentsList, holidaysList, departure?:number(ms) }` (departure defaults to the next one).
 */
export default function TripDetail({ route, navigation }) {
    return (
        <AppScreen>
            <EmptyState title={Lang.t('screenTripDetailName')} message="" />
        </AppScreen>
    );
}

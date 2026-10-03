import React from 'react';

import Lang from '../includes/Lang';

import { AppScreen, EmptyState } from './ui';

/**
 * F5: list of weekly reminders with on/off switches, plus create/edit through ReminderEditor.
 * Contract (stub screen — owned by the F5 reminders area).
 *
 * Route params: none.
 */
export default function RemindersScreen({ route, navigation }) {
    return (
        <AppScreen>
            <EmptyState title={Lang.t('screenRemindersName')} message="" />
        </AppScreen>
    );
}

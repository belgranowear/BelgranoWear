import React from 'react';

import Lang from '../includes/Lang';
import { StatusChip } from './ui';

export default function OfflineModeHint({ navigation, isOffline, sourceLabel }) {
    if (!isOffline) { return null; }

    return (
        <StatusChip
            icon="cloud-off-outline"
            label={sourceLabel ? `${Lang.t('offlineModeHint')} · ${sourceLabel}` : Lang.t('offlineModeHint')}
            tone="offline"
            onPress={() => { navigation.navigate('OfflineModeInfo'); }}
        />
    );
}

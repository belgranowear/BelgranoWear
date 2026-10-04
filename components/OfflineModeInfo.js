import React from 'react';

import { Button } from 'react-native-paper';

import Lang from '../includes/Lang';
import { MessageScreen } from './ui';

export default function OfflineModeInfo({ navigation }) {
    return (
        <MessageScreen
            title={Lang.t('screenOfflineModeInfoName')}
            message={Lang.t('offlineModeInfoMessage')}
            action={(
                <Button
                    mode="contained"
                    onPress={() => { navigation.goBack(); }}
                    accessibilityHint={Lang.t('goBackBtnLabel')}
                >
                    { Lang.t('gotItBtnLabel') }
                </Button>
            )}
        />
    );
}

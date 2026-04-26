import React from 'react';

import { Button, Text } from 'react-native-paper';

import Lang from '../includes/Lang';
import { AppScreen, TransitCard } from './ui';

export default function OfflineModeInfo({ navigation }) {
    return (
        <AppScreen>
            <TransitCard>
                <Text variant="headlineSmall" style={{ textAlign: 'center', fontWeight: '900' }}>
                    { Lang.t('screenOfflineModeInfoName') }
                </Text>

                <Text variant="bodyLarge" style={{ textAlign: 'center' }}>
                    { Lang.t('offlineModeInfoMessage') }
                </Text>

                <Button
                    mode="contained"
                    onPress={() => { navigation.goBack(); }}
                    accessibilityHint={Lang.t('goBackBtnLabel')}
                >
                    { Lang.t('gotItBtnLabel') }
                </Button>
            </TransitCard>
        </AppScreen>
    );
}

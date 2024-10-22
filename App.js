import 'react-native-gesture-handler';

import SplashScreen from 'react-native-splash-screen';

import React from 'react';

import { NavigationContainer } from '@react-navigation/native';

import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';

import { Platform  } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import DestinationPicker from './components/DestinationPicker';
import NextSchedule      from './components/NextSchedule';
import OfflineModeInfo   from './components/OfflineModeInfo';

import Lang from './includes/Lang';

const Stack = createStackNavigator();

export default function App() {
  if (SplashScreen !== null) {
    try {
      SplashScreen.hide();
    } catch (exception) {
      console.warn('SplashScreen.hide():', exception);
    }
  }

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{
          cardStyle:        {
            backgroundColor: 'black',
            paddingHorizontal: Platform.constants.uiMode === 'watch' ? 0 : 8,
          },
          headerShown:      Platform.constants.uiMode !== 'watch',
          gestureEnabled:   true,
          headerStyle:      { backgroundColor: 'black' },
          headerShadowVisible: false,
          headerTintColor:  'white',
          headerTitleAlign: 'center',
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          // gestureDirection: 'horizontal-inverted' // disabled on production builds, can be used to test the gesture handler on Expo Go on a WearOS device
        }}>
          <Stack.Screen name='DestinationPicker' component={DestinationPicker} options={{ title: Lang.t('screenDestinationPickerName') }}></Stack.Screen>
          <Stack.Screen name='NextSchedule'      component={NextSchedule}      options={{ title: Lang.t('screenNextScheduleName')      }}></Stack.Screen>
          <Stack.Screen name='OfflineModeInfo'   component={OfflineModeInfo}   options={{ title: Lang.t('screenOfflineModeInfoName')   }}></Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

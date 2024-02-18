import 'react-native-gesture-handler';

import SplashScreen from 'react-native-splash-screen';

import React from 'react';

import { NavigationContainer } from '@react-navigation/native';

import {
  createStackNavigator,
  CardStyleInterpolators
} from '@react-navigation/stack';

import DestinationPicker from './components/DestinationPicker';
import NextSchedule      from './components/NextSchedule';
import OfflineModeInfo   from './components/OfflineModeInfo';

const Stack = createStackNavigator();

export default function App() {
  if (SplashScreen !== null) {
    SplashScreen.hide();
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{
        cardStyle:        { backgroundColor: 'transparent' },
        headerShown:      false,
        gestureEnabled:   true,
        // gestureDirection: 'horizontal-inverted', // disabled on production builds, can be used to test the gesture handler on Expo Go on a WearOS device
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS
      }}>
        <Stack.Screen name='DestinationPicker' component={DestinationPicker} options={{ title: 'DestinationPicker' }}></Stack.Screen>
        <Stack.Screen name='NextSchedule'      component={NextSchedule}      options={{ title: 'NextSchedule'      }}></Stack.Screen>
        <Stack.Screen name='OfflineModeInfo'   component={OfflineModeInfo}   options={{ title: 'OfflineModeInfo'   }}></Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

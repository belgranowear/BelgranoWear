import SplashScreen from 'react-native-splash-screen';

import React from 'react';

import { NavigationContainer }        from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import DestinationPicker from './components/DestinationPicker';
import NextSchedule      from './components/NextSchedule';
import OfflineModeInfo   from './components/OfflineModeInfo';

const Stack = createNativeStackNavigator();

export default function App() {
  SplashScreen.hide();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name='Home'            component={DestinationPicker} options={{ title: 'Home'            }}></Stack.Screen>
        <Stack.Screen name='NextSchedule'    component={NextSchedule}      options={{ title: 'NextSchedule'    }}></Stack.Screen>
        <Stack.Screen name='OfflineModeInfo' component={OfflineModeInfo}   options={{ title: 'OfflineModeInfo' }}></Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

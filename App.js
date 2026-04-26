import 'react-native-gesture-handler';

import SplashScreen from 'react-native-splash-screen';

import React from 'react';

import { NavigationContainer } from '@react-navigation/native';

import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';

import { Platform, useWindowDimensions } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';

import DestinationPicker from './components/DestinationPicker';
import NextSchedule      from './components/NextSchedule';
import OfflineModeInfo   from './components/OfflineModeInfo';

import Lang from './includes/Lang';
import { ThemeProvider, useTheme } from './includes/Theme';
import { getInitialRouteNameForPreview, isWatchUIPreview, previewParams } from './includes/UIPreview';

const Stack = createStackNavigator();

function AppNavigator() {
  const { theme, activeScheme, navigationTheme } = useTheme();
  const { width, height } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const isWatch = Platform.constants?.uiMode === 'watch' || isWatchUIPreview() || (Platform.OS === 'android' && shortestSide <= 500 && Math.abs(width - height) <= 32);

  const initialRouteName = getInitialRouteNameForPreview();

  return (
    <>
      <StatusBar style={activeScheme === 'light' ? 'dark' : 'light'} />
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{
          cardStyle:        {
            backgroundColor: theme.background,
            paddingHorizontal: isWatch ? 0 : 8,
          },
          headerShown:      !isWatch,
          gestureEnabled:   true,
          headerStyle:      { backgroundColor: theme.background },
          headerShadowVisible: false,
          headerTintColor:  theme.text,
          headerTitleAlign: 'center',
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          // gestureDirection: 'horizontal-inverted' // disabled on production builds, can be used to test the gesture handler on Expo Go on a WearOS device
        }}>
          <Stack.Screen name='DestinationPicker' component={DestinationPicker} options={{ title: Lang.t('screenDestinationPickerName') }}></Stack.Screen>
          <Stack.Screen name='NextSchedule'      component={NextSchedule}      initialParams={previewParams} options={{ title: Lang.t('screenNextScheduleName')      }}></Stack.Screen>
          <Stack.Screen name='OfflineModeInfo'   component={OfflineModeInfo}   options={{ title: Lang.t('screenOfflineModeInfoName')   }}></Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

function ThemedApp() {
  const { paperTheme } = useTheme();

  return (
    <PaperProvider theme={paperTheme}>
      <AppNavigator />
    </PaperProvider>
  );
}

export default function App() {
  if (SplashScreen?.hide) {
    try {
      SplashScreen.hide();
    } catch (exception) {
      console.warn('SplashScreen.hide():', exception);
    }
  }

  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}

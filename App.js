import 'react-native-gesture-handler';

import SplashScreen from 'react-native-splash-screen';

import React, { useEffect, useState } from 'react';

import { NavigationContainer } from '@react-navigation/native';

import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';

import { AppState, useWindowDimensions } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';

import DestinationPicker from './components/DestinationPicker';
import NextSchedule      from './components/NextSchedule';
import OfflineModeInfo   from './components/OfflineModeInfo';
import Settings          from './components/Settings';
import About             from './components/About';
import FullSchedule      from './components/FullSchedule';
import TripDetail        from './components/TripDetail';
import RemindersScreen   from './components/RemindersScreen';

import Lang from './includes/Lang';
import Reminders from './includes/Reminders';
import { ThemeProvider, useTheme } from './includes/Theme';
import { getInitialRouteNameForPreview, isAnyUIPreview, previewParams } from './includes/UIPreview';
import { isWatchDevice } from './includes/Device';

const Stack = createStackNavigator();

const SPLASH_SCREEN_MAX_WAIT_MS = 1500;

let isSplashScreenHidden = false;

const hideSplashScreen = () => {
  if (isSplashScreenHidden || !SplashScreen?.hide) { return; }

  isSplashScreenHidden = true;

  try {
    SplashScreen.hide();
  } catch (exception) {
    console.warn('SplashScreen.hide():', exception);
  }
};

function AppNavigator() {
  const { theme, activeScheme, navigationTheme, ready } = useTheme();
  const { width, height } = useWindowDimensions();
  const isWatch = isWatchDevice({ width, height });

  const initialRouteName = getInitialRouteNameForPreview();
  const nextScheduleInitialParams = isAnyUIPreview() ? previewParams : undefined;

  useEffect(() => {
    if (ready) { hideSplashScreen(); }
  }, [ ready ]);

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
          <Stack.Screen name='NextSchedule'      component={NextSchedule}      initialParams={nextScheduleInitialParams} options={{ title: Lang.t('screenNextScheduleName')      }}></Stack.Screen>
          <Stack.Screen name='OfflineModeInfo'   component={OfflineModeInfo}   options={{ title: Lang.t('screenOfflineModeInfoName')   }}></Stack.Screen>
          <Stack.Screen name='Settings'          component={Settings}          options={{ title: Lang.t('screenSettingsName')          }}></Stack.Screen>
          <Stack.Screen name='About'             component={About}             options={{ title: Lang.t('screenAboutName')             }}></Stack.Screen>
          <Stack.Screen name='FullSchedule'      component={FullSchedule}      initialParams={nextScheduleInitialParams} options={{ title: Lang.t('screenFullScheduleName') }}></Stack.Screen>
          <Stack.Screen name='TripDetail'        component={TripDetail}        initialParams={nextScheduleInitialParams} options={{ title: Lang.t('screenTripDetailName')   }}></Stack.Screen>
          <Stack.Screen name='Reminders'         component={RemindersScreen}   options={{ title: Lang.t('screenRemindersName')    }}></Stack.Screen>
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
  const [ locale, setLocale ] = useState(Lang.locale);

  useEffect(() => {
    // Safety net: never keep the splash up if the saved theme takes too long to load.
    const timeoutHandle = setTimeout(hideSplashScreen, SPLASH_SCREEN_MAX_WAIT_MS);

    return () => clearTimeout(timeoutHandle);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && Lang.refreshLocale()) { setLocale(Lang.locale); }
    });

    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider>
      <ThemedApp key={locale} />
    </ThemeProvider>
  );
}

// Registers the foreground notification handler and reminder tap routing as early as possible.
Reminders.initialize();

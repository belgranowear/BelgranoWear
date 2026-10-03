import 'react-native-gesture-handler';

import SplashScreen from 'react-native-splash-screen';

import React, { useEffect, useState } from 'react';

import { CommonActions, NavigationContainer, StackActions, createNavigationContainerRef } from '@react-navigation/native';

import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';

import { AppState, Platform, StyleSheet, View } from 'react-native';
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

import NavigationRail     from './components/layout/NavigationRail';
import HeaderOverflowMenu from './components/layout/HeaderOverflowMenu';
import { CONTENT_WIDTHS, useResponsiveMetrics } from './components/ui';

import Lang from './includes/Lang';
import Reminders from './includes/Reminders';
import { ThemeProvider, useTheme } from './includes/Theme';
import { getInitialRouteNameForPreview, isAnyUIPreview, previewParams } from './includes/UIPreview';

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

const navigationRef = createNavigationContainerRef();

// Top-level destinations shown in the NavigationRail (expanded layouts) and in the compact
// top-bar overflow menu. `routes` lists every stack route that highlights the destination.
const SHELL_DESTINATIONS = [
    { key: 'DestinationPicker', labelKey: 'navDestinationsLabel', icon: 'train',             activeIcon: 'train'       },
    { key: 'Reminders',         labelKey: 'navRemindersLabel',    icon: 'bell-outline',      activeIcon: 'bell'        },
    { key: 'Settings',          labelKey: 'navSettingsLabel',     icon: 'cog-outline',       activeIcon: 'cog'         },
    { key: 'About',             labelKey: 'navAboutLabel',        icon: 'information-outline', activeIcon: 'information' }
];

const TOP_LEVEL_ROUTES = SHELL_DESTINATIONS.map(destination => destination.key);

const railKeyForRoute = routeName => TOP_LEVEL_ROUTES.indexOf(routeName) > -1 ? routeName : 'DestinationPicker';

// Rail destinations behave like tabs: keep the stack root mounted (DestinationPicker keeps its
// state) and show at most one destination on top of it.
const openTopLevelRoute = routeName => {
    if (!navigationRef.isReady()) { return; }

    const state = navigationRef.getRootState();
    const root = state.routes[0];
    const current = state.routes[state.index];

    if (current.name === routeName) { return; }

    if (root.name === routeName) {
        navigationRef.dispatch(StackActions.popToTop());
        return;
    }

    navigationRef.dispatch(CommonActions.reset({
        index: 1,
        routes: [ root, { name: routeName } ]
    }));
};

function AppNavigator() {
  const { theme, activeScheme, navigationTheme, ready } = useTheme();
  const responsive = useResponsiveMetrics();
  const isWatch = responsive.isWatch;
  const hasRail = responsive.hasNavigationRail;
  const [ currentRouteName, setCurrentRouteName ] = useState(null);

  const initialRouteName = getInitialRouteNameForPreview();
  const nextScheduleInitialParams = isAnyUIPreview() ? previewParams : undefined;

  useEffect(() => {
    if (ready) { hideSplashScreen(); }
  }, [ ready ]);

  const syncCurrentRoute = () => setCurrentRouteName(navigationRef.getCurrentRoute()?.name || null);

  const railItems = SHELL_DESTINATIONS.map(destination => ({
    key:        destination.key,
    label:      Lang.t(destination.labelKey),
    icon:       destination.icon,
    activeIcon: destination.activeIcon
  }));

  const overflowItems = railItems
    .filter(item => item.key !== 'DestinationPicker')
    .map(item => ({ key: item.key, label: item.label, icon: item.icon, onPress: () => navigationRef.navigate(item.key) }));

  const renderOverflowMenu = () => (
    <HeaderOverflowMenu items={overflowItems} accessibilityLabel={Lang.t('navMoreOptionsLabel')} />
  );

  const screenOptions = ({ route }) => {
    const isTopLevel = TOP_LEVEL_ROUTES.indexOf(route.name) > -1;

    return {
      cardStyle: [
        styles.card,
        Platform.OS === 'web' ? styles.cardWeb : undefined,
        {
          backgroundColor:   theme.background,
          paddingHorizontal: isWatch ? 0 : 8
        }
      ],
      headerShown:         !isWatch && !(hasRail && route.name === 'DestinationPicker'),
      // With the rail, top-level destinations are switched like tabs: no back arrow.
      headerLeft:          hasRail && isTopLevel ? () => null : undefined,
      gestureEnabled:      true,
      headerStyle:         { backgroundColor: theme.roles.surface, elevation: 0, shadowOpacity: 0 },
      headerShadowVisible: false,
      headerTintColor:     theme.text,
      headerTitleStyle:    [ styles.headerTitle, theme.type.emphasized.title ],
      headerTitleAlign:    'left',
      headerRightContainerStyle: styles.headerRight,
      cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
      // gestureDirection: 'horizontal-inverted' // disabled on production builds, can be used to test the gesture handler on Expo Go on a WearOS device
    };
  };

  const navigator = (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={screenOptions}>
      <Stack.Screen name='DestinationPicker' component={DestinationPicker} options={{ title: Lang.t('screenDestinationPickerName'), headerRight: hasRail ? undefined : renderOverflowMenu }}></Stack.Screen>
      <Stack.Screen name='NextSchedule'      component={NextSchedule}      initialParams={nextScheduleInitialParams} options={{ title: Lang.t('screenNextScheduleName')      }}></Stack.Screen>
      <Stack.Screen name='OfflineModeInfo'   component={OfflineModeInfo}   options={{ title: Lang.t('screenOfflineModeInfoName')   }}></Stack.Screen>
      <Stack.Screen name='Settings'          component={Settings}          options={{ title: Lang.t('screenSettingsName')          }}></Stack.Screen>
      <Stack.Screen name='About'             component={About}             options={{ title: Lang.t('screenAboutName')             }}></Stack.Screen>
      <Stack.Screen name='FullSchedule'      component={FullSchedule}      initialParams={nextScheduleInitialParams} options={{ title: Lang.t('screenFullScheduleName') }}></Stack.Screen>
      <Stack.Screen name='TripDetail'        component={TripDetail}        initialParams={nextScheduleInitialParams} options={{ title: Lang.t('screenTripDetailName')   }}></Stack.Screen>
      <Stack.Screen name='Reminders'         component={RemindersScreen}   options={{ title: Lang.t('screenRemindersName')    }}></Stack.Screen>
    </Stack.Navigator>
  );

  return (
    <>
      <StatusBar style={activeScheme === 'light' ? 'dark' : 'light'} />
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
        onReady={syncCurrentRoute}
        onStateChange={syncCurrentRoute}
      >
        <View style={[ styles.shellRoot, { backgroundColor: theme.background } ]}>
          <View style={[ styles.shellRow, hasRail ? { maxWidth: CONTENT_WIDTHS.shell } : undefined ]}>
            {hasRail ? (
              <NavigationRail
                items={railItems}
                activeKey={railKeyForRoute(currentRouteName || initialRouteName)}
                onSelect={openTopLevelRoute}
                accessibilityLabel={Lang.t('navRailLabel')}
              />
            ) : null}
            <View style={styles.shellContent}>{navigator}</View>
          </View>
        </View>
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

// The whole chain (root → shell → navigator → card → screen) must be height-bounded: Expo web
// sets body{overflow:hidden}, so content that grows past the viewport can never be scrolled.
const styles = StyleSheet.create({
  shellRoot: {
    flex:       1,
    minHeight:  0,
    alignItems: 'center'
  },
  shellRow: {
    flex:          1,
    minHeight:     0,
    width:         '100%',
    flexDirection: 'row'
  },
  shellContent: {
    flex:      1,
    minWidth:  0,
    minHeight: 0,
    overflow:  'hidden'
  },
  card: {
    flex: 1
  },
  // @react-navigation/stack switches a card that fills <body> to "page" mode (minHeight:100%,
  // unbounded) so the document scrolls; Expo web disables document scrolling, so force the
  // bounded card layout instead.
  cardWeb: {
    minHeight: 0,
    overflow:  'hidden'
  },
  headerTitle: {
    fontSize: 22
  },
  headerRight: {
    paddingRight: 8
  }
});

// Registers the foreground notification handler and reminder tap routing as early as possible.
Reminders.initialize();

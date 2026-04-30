import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { Platform, useColorScheme } from 'react-native';

import * as SystemUI from 'expo-system-ui';

import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

import Preferences from './Preferences';

const ThemeContext = createContext(null);

// React Native's PlatformColor returns an opaque native color object. React Native Paper
// parses theme colors with JS color utilities, so passing PlatformColor into MD3 theme
// tokens crashes on Android/Expo Go with "Unable to parse color from object".
// Keep Material You as planned platform work until we can provide Paper with resolved
// hex values from a compatible dynamic-color library/native bridge.
const isAndroidDynamicColorAvailable = () => false;

const fallback = {
    light: {
        primary:          '#be4936',
        onPrimary:        '#ffffff',
        primaryContainer: '#ffd8cf',
        background:       '#fff8f6',
        surface:          '#fff8f6',
        surfaceVariant:   '#f2ddd7',
        outline:          '#90746d',
        onSurface:        '#251815',
        onSurfaceVariant: '#5d4039',
        error:            '#b3261e',
        success:          '#256b3a',
        warning:          '#9a5b00'
    },
    dark: {
        primary:          '#ffb4a8',
        onPrimary:        '#5d170e',
        primaryContainer: '#7e2b20',
        background:       '#080403',
        surface:          '#120d0c',
        surfaceVariant:   '#3b2925',
        outline:          '#a98e86',
        onSurface:        '#fff7f4',
        onSurfaceVariant: '#d7bdb6',
        error:            '#ffb4ab',
        success:          '#a7eab1',
        warning:          '#ffd28a'
    }
};

const dynamic = scheme => {
    if (scheme === 'light') {
        return {
            primary:          fallback.light.primary,
            onPrimary:        fallback.light.onPrimary,
            primaryContainer: fallback.light.primaryContainer,
            background:       fallback.light.background,
            surface:          fallback.light.surface,
            surfaceVariant:   fallback.light.surfaceVariant,
            outline:          fallback.light.outline,
            onSurface:        fallback.light.onSurface,
            onSurfaceVariant: fallback.light.onSurfaceVariant,
            error:            fallback.light.error,
            success:          fallback.light.success,
            warning:          fallback.light.warning
        };
    }

    return {
        primary:          fallback.dark.primary,
        onPrimary:        fallback.dark.onPrimary,
        primaryContainer: fallback.dark.primaryContainer,
        background:       fallback.dark.background,
        surface:          fallback.dark.surface,
        surfaceVariant:   fallback.dark.surfaceVariant,
        outline:          fallback.dark.outline,
        onSurface:        fallback.dark.onSurface,
        onSurfaceVariant: fallback.dark.onSurfaceVariant,
        error:            fallback.dark.error,
        success:          fallback.dark.success,
        warning:          fallback.dark.warning
    };
};

const createThemes = scheme => {
    const base = scheme === 'light' ? MD3LightTheme : MD3DarkTheme;
    const colors = dynamic(scheme);

    const paperTheme = {
        ...base,
        roundness: 5,
        colors: {
            ...base.colors,
            ...colors,
            secondary: colors.primary,
            secondaryContainer: colors.primaryContainer,
            surfaceDisabled: scheme === 'light' ? '#ead2cb' : '#33211d',
            backdrop: scheme === 'light' ? 'rgba(37,24,21,0.18)' : 'rgba(0,0,0,0.55)'
        }
    };

    const appTheme = {
        scheme,
        isDark: scheme === 'dark',
        background: colors.background,
        backgroundFallback: fallback[scheme].background,
        surface: colors.surface,
        surfaceStrong: colors.surfaceVariant,
        card: colors.surface,
        text: colors.onSurface,
        textMuted: colors.onSurfaceVariant,
        textInverse: colors.onPrimary,
        border: colors.outline,
        accent: colors.primary,
        accentStrong: colors.primary,
        accentSoft: colors.primaryContainer,
        warning: colors.warning,
        warningSurface: scheme === 'light' ? '#fff0cf' : '#3a2807',
        success: colors.success,
        successSurface: scheme === 'light' ? '#dbf6df' : '#12351c',
        offline: scheme === 'light' ? '#4b5563' : '#d1d5db',
        offlineSurface: scheme === 'light' ? '#e5e7eb' : '#30343b',
        spacing: { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
        radius: { sm: 8, md: 14, lg: 22, xl: 28, pill: 999 },
        touchTarget: { minHeight: 48, watchMinHeight: 44 },
        motion: { quick: 180, normal: 500 },
        paperTheme
    };

    const navigationTheme = {
        dark: appTheme.isDark,
        colors: {
            primary:      colors.primary,
            background:   colors.background,
            card:         colors.surface,
            text:         colors.onSurface,
            border:       colors.outline,
            notification: colors.primary
        }
    };

    return { appTheme, paperTheme, navigationTheme };
};

const isWearOSDevice = () => Platform.constants?.uiMode === 'watch';

const resolveSystemScheme = systemScheme => {
    if (isWearOSDevice()) {
        // WearOS surfaces are dark-first. Some Android builds report "light" when the
        // host Activity uses a light native theme, so keep "Sistema" safely dark on watches.
        return 'dark';
    }

    return systemScheme === 'light' ? 'light' : 'dark';
};

export function ThemeProvider({ children }) {
    const systemScheme = useColorScheme();
    const [ themeMode, setThemeModeState ] = useState('system');

    useEffect(() => {
        Preferences.getThemeMode().then(setThemeModeState);
    }, []);

    const activeScheme = themeMode === 'system'
        ? resolveSystemScheme(systemScheme)
        : themeMode;

    const { appTheme, paperTheme, navigationTheme } = useMemo(
        () => createThemes(activeScheme),
        [ activeScheme ]
    );

    useEffect(() => {
        SystemUI.setBackgroundColorAsync(appTheme.backgroundFallback).catch(exception => {
            console.warn('Theme: failed to set system background:', exception);
        });
    }, [ appTheme.backgroundFallback ]);

    const setThemeMode = async nextThemeMode => {
        setThemeModeState(nextThemeMode);
        await Preferences.setThemeMode(nextThemeMode);
    };

    const cycleThemeMode = async () => {
        const modes = [ 'system', 'light', 'dark' ];
        const nextThemeMode = modes[(modes.indexOf(themeMode) + 1) % modes.length];
        await setThemeMode(nextThemeMode);
    };

    const value = useMemo(() => ({
        theme: appTheme,
        paperTheme,
        navigationTheme,
        themeMode,
        activeScheme,
        setThemeMode,
        cycleThemeMode,
        isAndroidDynamicColorAvailable: isAndroidDynamicColorAvailable()
    }), [ appTheme, paperTheme, navigationTheme, themeMode, activeScheme ]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) { throw new Error('useTheme() must be used inside ThemeProvider.'); }

    return context;
}

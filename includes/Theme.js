import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { Platform, useColorScheme } from 'react-native';

import * as SystemUI from 'expo-system-ui';

import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

import Preferences from './Preferences';
import { isWatchUIPreview } from './UIPreview';

const ThemeContext = createContext(null);

// React Native's PlatformColor returns an opaque native color object. React Native Paper
// parses theme colors with JS color utilities, so passing PlatformColor into MD3 theme
// tokens crashes on Android/Expo Go with "Unable to parse color from object".
// Material You stays planned work: @material/material-color-utilities (already a dependency)
// can turn a system seed color into hex roles once a native bridge provides that seed.
const isAndroidDynamicColorAvailable = () => false;

// Material 3 color roles generated from the Ferrovías red. See scripts/generate-theme.mjs for
// the variant, overrides and contrast report, and docs/ui/notes/B.md for usage guidance.
// <generated-palette> Do not edit by hand: run `node scripts/generate-theme.mjs`.
// Seed #be4936, MCU Fidelity (spec 2021, contrast 0) + BelgranoWear overrides.
const palette = {
    light: {
        primary:                  '#be4936',
        onPrimary:                '#ffffff',
        primaryContainer:         '#ffdad4',
        onPrimaryContainer:       '#862112',
        inversePrimary:           '#ffb4a6',
        secondary:                '#775651',
        onSecondary:              '#ffffff',
        secondaryContainer:       '#f1dfdb',
        onSecondaryContainer:     '#5d3f3a',
        tertiary:                 '#356132',
        onTertiary:               '#ffffff',
        tertiaryContainer:        '#bdf0b3',
        onTertiaryContainer:      '#255023',
        error:                    '#ba1a1a',
        onError:                  '#ffffff',
        errorContainer:           '#ffdad6',
        onErrorContainer:         '#93000a',
        background:               '#fff8f6',
        onBackground:             '#241917',
        surface:                  '#fff8f6',
        surfaceDim:               '#ebd5d1',
        surfaceBright:            '#fff8f6',
        surfaceContainerLowest:   '#ffffff',
        surfaceContainerLow:      '#fff0ee',
        surfaceContainer:         '#ffe9e5',
        surfaceContainerHigh:     '#fae3df',
        surfaceContainerHighest:  '#f4deda',
        onSurface:                '#241917',
        surfaceVariant:           '#fcdbd5',
        onSurfaceVariant:         '#58423e',
        inverseSurface:           '#3b2d2b',
        inverseOnSurface:         '#ffedea',
        outline:                  '#8b716c',
        outlineVariant:           '#dfc0ba',
        shadow:                   '#000000',
        scrim:                    '#000000',
        action:                   '#be4936',
        onAction:                 '#ffffff',
        success:                  '#3c6839',
        onSuccess:                '#ffffff',
        successContainer:         '#bdf0b3',
        onSuccessContainer:       '#255023',
        warning:                  '#8a5100',
        onWarning:                '#ffffff',
        warningContainer:         '#ffdcbd',
        onWarningContainer:       '#693c00',
        offline:                  '#5b5e66',
        offlineContainer:         '#e0e2ec',
        onOfflineContainer:       '#43474e'
    },
    dark: {
        primary:                  '#ffb4a6',
        onPrimary:                '#660701',
        primaryContainer:         '#be4936',
        onPrimaryContainer:       '#fff1ee',
        inversePrimary:           '#a73827',
        secondary:                '#e7bdb5',
        onSecondary:              '#442a25',
        secondaryContainer:       '#5d3f3a',
        onSecondaryContainer:     '#ffdad4',
        tertiary:                 '#a2d399',
        onTertiary:               '#0c390e',
        tertiaryContainer:        '#255023',
        onTertiaryContainer:      '#bdf0b3',
        error:                    '#ffb4ab',
        onError:                  '#690005',
        errorContainer:           '#93000a',
        onErrorContainer:         '#ffdad6',
        background:               '#1b110f',
        onBackground:             '#f4deda',
        surface:                  '#1b110f',
        surfaceDim:               '#1b110f',
        surfaceBright:            '#443633',
        surfaceContainerLowest:   '#160c0a',
        surfaceContainerLow:      '#241917',
        surfaceContainer:         '#291d1b',
        surfaceContainerHigh:     '#342725',
        surfaceContainerHighest:  '#3f322f',
        onSurface:                '#f4deda',
        surfaceVariant:           '#58423e',
        onSurfaceVariant:         '#dfc0ba',
        inverseSurface:           '#f4deda',
        inverseOnSurface:         '#3b2d2b',
        outline:                  '#a68a85',
        outlineVariant:           '#58423e',
        shadow:                   '#000000',
        scrim:                    '#000000',
        action:                   '#be4936',
        onAction:                 '#fff1ee',
        success:                  '#a2d399',
        onSuccess:                '#0c390e',
        successContainer:         '#255023',
        onSuccessContainer:       '#bdf0b3',
        warning:                  '#ffb86e',
        onWarning:                '#492900',
        warningContainer:         '#693c00',
        onWarningContainer:       '#ffdcbd',
        offline:                  '#c4c6cf',
        offlineContainer:         '#43474e',
        onOfflineContainer:       '#e0e2ec'
    },
    // OLED overrides applied on top of `dark` for WearOS and the web watch preview.
    watch: {
        background:               '#000000',
        surface:                  '#000000',
        surfaceDim:               '#000000',
        surfaceContainerLowest:   '#000000',
        surfaceContainerLow:      '#1b110f',
        surfaceContainer:         '#241917',
        surfaceContainerHigh:     '#2d211f',
        surfaceContainerHighest:  '#342725',
        surfaceBright:            '#3f322f'
    }
};
// </generated-palette>

const withAlpha = (hex, alpha) => {
    const value = parseInt(hex.slice(1), 16);

    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

// M3 Expressive shape scale (corner radius in dp). Source: m3.material.io/styles/shape
// (corner-radius-scale, Expressive update May 2025).
const shape = {
    none:        0,
    xs:          4,
    sm:          8,
    md:          12,
    lg:          16,
    lgIncreased: 20,
    xl:          28,
    xlIncreased: 32,
    xxl:         48,
    full:        999
};

// Paper MD3 multiplies `roundness` per component: Button/SegmentedButtons ×5 (20 = full on the
// default 40 dp button), Card ×3 (12 = md), Chip ×2 (8 = sm), FAB ×3/×4/×7 (12/16/28) and
// Dialog/Searchbar ×7 (28 = xl). A roundness of shape.xs lands every one on the scale above.
const roundness = shape.xs;

// Emphasized type: same sizes as the MD3 baseline scale, heavier weight and tighter tracking
// for the hero time, titles and key labels (M3 Expressive "emphasized" type styles). Android's
// bundled Roboto only ships 400/500/700, so 700 is used for the emphasized weight.
const emphasized = {
    display:  { fontWeight: '700', letterSpacing: -0.5 },
    headline: { fontWeight: '700', letterSpacing: -0.25 },
    title:    { fontWeight: '700' },
    body:     { fontWeight: '500' },
    label:    { fontWeight: '700', letterSpacing: 0.2 }
};

// Adds `<variant>Emphasized` fonts (e.g. `displayLargeEmphasized`) next to Paper's MD3 fonts so
// screens can use `<Text variant="displayLargeEmphasized">`. Existing variants are untouched.
const createFonts = baseFonts => {
    const fonts = { ...baseFonts };

    Object.keys(baseFonts).forEach(variant => {
        const category = Object.keys(emphasized).find(name => variant.indexOf(name) === 0);

        if (category) { fonts[`${variant}Emphasized`] = { ...baseFonts[variant], ...emphasized[category] }; }
    });

    return fonts;
};

// M3 Expressive motion scheme springs (Compose MotionScheme.expressive()), converted from
// dampingRatio/stiffness to Animated.spring/Reanimated `damping = 2 · ratio · √(stiffness · mass)`.
//   fastSpatial    ratio 0.6, stiffness 800    defaultSpatial ratio 0.8, stiffness 380
//   slowSpatial    ratio 0.8, stiffness 200    fast/default/slowEffects ratio 1, stiffness 3800/1600/800
// Spatial springs (position, size, shape) overshoot slightly; effects springs (color, opacity)
// are critically damped and never bounce.
const spring = (dampingRatio, stiffness) => ({
    damping: Math.round(2 * dampingRatio * Math.sqrt(stiffness) * 10) / 10,
    stiffness,
    mass:    1
});

const motionSpring = {
    fastSpatial:    spring(0.6, 800),
    defaultSpatial: spring(0.8, 380),
    slowSpatial:    spring(0.8, 200),
    fastEffects:    spring(1, 3800),
    defaultEffects: spring(1, 1600),
    slowEffects:    spring(1, 800)
};

const resolveColors = (scheme, isWatch) => {
    if (scheme === 'light') { return palette.light; }

    return isWatch ? { ...palette.dark, ...palette.watch } : palette.dark;
};

const createThemes = (scheme, isWatch) => {
    const base = scheme === 'light' ? MD3LightTheme : MD3DarkTheme;
    const colors = resolveColors(scheme, isWatch);

    const paperTheme = {
        ...base,
        roundness,
        fonts: createFonts(base.fonts),
        colors: {
            ...base.colors,
            primary:              colors.primary,
            onPrimary:            colors.onPrimary,
            primaryContainer:     colors.primaryContainer,
            onPrimaryContainer:   colors.onPrimaryContainer,
            secondary:            colors.secondary,
            onSecondary:          colors.onSecondary,
            secondaryContainer:   colors.secondaryContainer,
            onSecondaryContainer: colors.onSecondaryContainer,
            tertiary:             colors.tertiary,
            onTertiary:           colors.onTertiary,
            tertiaryContainer:    colors.tertiaryContainer,
            onTertiaryContainer:  colors.onTertiaryContainer,
            error:                colors.error,
            onError:              colors.onError,
            errorContainer:       colors.errorContainer,
            onErrorContainer:     colors.onErrorContainer,
            background:           colors.background,
            onBackground:         colors.onBackground,
            surface:              colors.surface,
            onSurface:            colors.onSurface,
            surfaceVariant:       colors.surfaceVariant,
            onSurfaceVariant:     colors.onSurfaceVariant,
            outline:              colors.outline,
            outlineVariant:       colors.outlineVariant,
            inverseSurface:       colors.inverseSurface,
            inverseOnSurface:     colors.inverseOnSurface,
            inversePrimary:       colors.inversePrimary,
            shadow:               colors.shadow,
            scrim:                colors.scrim,
            surfaceDisabled:      withAlpha(colors.onSurface, 0.12),
            onSurfaceDisabled:    withAlpha(colors.onSurface, 0.38),
            backdrop:             withAlpha(colors.scrim, scheme === 'light' ? 0.32 : 0.6),
            // Paper tints elevated surfaces with these; map them to the MD3 surface containers.
            elevation: {
                level0: 'transparent',
                level1: colors.surfaceContainerLow,
                level2: colors.surfaceContainer,
                level3: colors.surfaceContainerHigh,
                level4: colors.surfaceContainerHigh,
                level5: colors.surfaceContainerHighest
            }
        }
    };

    const appTheme = {
        scheme,
        isDark:  scheme === 'dark',
        isWatch: Boolean(isWatch),
        // Legacy aliases, recomputed from the MD3 roles so existing screens pick up the palette.
        background:         colors.background,
        backgroundFallback: colors.background,
        surface:            colors.surface,
        surfaceStrong:      colors.surfaceContainerHigh,
        card:               colors.surfaceContainerLow,
        text:               colors.onSurface,
        textMuted:          colors.onSurfaceVariant,
        textInverse:        colors.onPrimary,
        border:             colors.outlineVariant,
        accent:             colors.primary,
        // accentSoft/accentStrong are used as a "selected" fill + its content color, so they map
        // to the tonal secondary pair (selection) instead of the red action color.
        accentStrong:       colors.onSecondaryContainer,
        accentSoft:         colors.secondaryContainer,
        warning:            colors.warning,
        warningSurface:     colors.warningContainer,
        success:            colors.success,
        successSurface:     colors.successContainer,
        offline:            colors.offline,
        offlineSurface:     colors.offlineContainer,
        spacing:     { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
        // Legacy radius keys aligned with the shape scale (sm, md, lgIncreased, xl, full).
        radius:      { sm: shape.sm, md: shape.md, lg: shape.lgIncreased, xl: shape.xl, pill: shape.full },
        touchTarget: { minHeight: 48, watchMinHeight: 44 },
        motion: {
            quick:  180,
            normal: 500,
            spring: motionSpring
        },
        // Full Material 3 color roles plus BelgranoWear semantic extensions
        // (action, success*, warning*, offline*). See docs/ui/notes/B.md.
        roles: {
            primary:                 colors.primary,
            onPrimary:               colors.onPrimary,
            primaryContainer:        colors.primaryContainer,
            onPrimaryContainer:      colors.onPrimaryContainer,
            inversePrimary:          colors.inversePrimary,
            secondary:               colors.secondary,
            onSecondary:             colors.onSecondary,
            secondaryContainer:      colors.secondaryContainer,
            onSecondaryContainer:    colors.onSecondaryContainer,
            tertiary:                colors.tertiary,
            onTertiary:              colors.onTertiary,
            tertiaryContainer:       colors.tertiaryContainer,
            onTertiaryContainer:     colors.onTertiaryContainer,
            error:                   colors.error,
            onError:                 colors.onError,
            errorContainer:          colors.errorContainer,
            onErrorContainer:        colors.onErrorContainer,
            background:              colors.background,
            onBackground:            colors.onBackground,
            surface:                 colors.surface,
            surfaceDim:              colors.surfaceDim,
            surfaceBright:           colors.surfaceBright,
            surfaceContainerLowest:  colors.surfaceContainerLowest,
            surfaceContainerLow:     colors.surfaceContainerLow,
            surfaceContainer:        colors.surfaceContainer,
            surfaceContainerHigh:    colors.surfaceContainerHigh,
            surfaceContainerHighest: colors.surfaceContainerHighest,
            onSurface:               colors.onSurface,
            surfaceVariant:          colors.surfaceVariant,
            onSurfaceVariant:        colors.onSurfaceVariant,
            inverseSurface:          colors.inverseSurface,
            inverseOnSurface:        colors.inverseOnSurface,
            outline:                 colors.outline,
            outlineVariant:          colors.outlineVariant,
            shadow:                  colors.shadow,
            scrim:                   colors.scrim,
            action:                  colors.action,
            onAction:                colors.onAction,
            success:                 colors.success,
            onSuccess:               colors.onSuccess,
            successContainer:        colors.successContainer,
            onSuccessContainer:      colors.onSuccessContainer,
            warning:                 colors.warning,
            onWarning:               colors.onWarning,
            warningContainer:        colors.warningContainer,
            onWarningContainer:      colors.onWarningContainer,
            offline:                 colors.offline,
            offlineContainer:        colors.offlineContainer,
            onOfflineContainer:      colors.onOfflineContainer
        },
        shape,
        type: {
            emphasized,
            // Fixed-width digits so live times and countdowns do not jitter while updating.
            tabular: { fontVariant: [ 'tabular-nums' ] }
        },
        paperTheme
    };

    const navigationTheme = {
        dark: appTheme.isDark,
        colors: {
            primary:      colors.primary,
            background:   colors.background,
            card:         colors.surface,
            text:         colors.onSurface,
            border:       colors.outlineVariant,
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
    const [ ready,     setReady          ] = useState(false);

    // OLED black applies on real watches and in the web watch preview (?uiPreview=watch-*).
    const isWatch = useMemo(() => isWearOSDevice() || isWatchUIPreview(), []);

    useEffect(() => {
        Preferences.getThemeMode()
            .then(setThemeModeState)
            .catch(exception => console.warn('Theme: failed to load theme mode:', exception))
            .finally(() => setReady(true));
    }, []);

    const activeScheme = themeMode === 'system'
        ? resolveSystemScheme(systemScheme)
        : themeMode;

    const { appTheme, paperTheme, navigationTheme } = useMemo(
        () => createThemes(activeScheme, isWatch),
        [ activeScheme, isWatch ]
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
        ready,
        isAndroidDynamicColorAvailable: isAndroidDynamicColorAvailable()
    }), [ appTheme, paperTheme, navigationTheme, themeMode, activeScheme, ready ]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) { throw new Error('useTheme() must be used inside ThemeProvider.'); }

    return context;
}

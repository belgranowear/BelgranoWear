#!/usr/bin/env node
// Generates the Material 3 color roles used by includes/Theme.js from the Ferrovías red.
//
// Usage:
//   node scripts/generate-theme.mjs           rewrite the generated block in includes/Theme.js
//   node scripts/generate-theme.mjs --check   print the palette + contrast report, write nothing
//
// The palette is precomputed (instead of running material-color-utilities at runtime) so the
// app does not pay the HCT/tonal math on every launch and the exact hex values are reviewable
// in git. Re-run this script whenever the seed or palette decisions below change.
//
// Decisions (see docs/ui/notes/B.md):
// - Variant FIDELITY from #be4936 (MCU 0.4.0, spec 2021, contrast 0). Fidelity keeps the
//   primary palette at the seed chroma, so the brand red survives (Expressive/TonalSpot drift).
// - Light `primary` is pinned to the seed itself (#be4936, 5.7:1 on white) instead of
//   Fidelity's darker #9d3121, and light `primaryContainer` uses the classic tone 90/30 pair
//   so it is a soft tonal surface rather than a second copy of the brand red.
// - `secondary` uses a low-chroma (16) palette at the seed hue: warm tonal brown used for
//   selection (`secondaryContainer`). Fidelity's own secondary equals primary in dark mode,
//   which made selection and action indistinguishable.
// - `tertiary` is a green palette so `tertiaryContainer` doubles as the "En vivo" chip.
// - `action`/`onAction` are a BelgranoWear extension: the brand red fill for the hero
//   button in both schemes (light: seed; dark: Fidelity primaryContainer, which is the seed).
// - `watch` overrides the dark scheme for OLED WearOS screens: pure black background and
//   surface, surfaceContainer* raised on neutral tones 6–17.
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

// material-color-utilities 0.4.0 ships ESM with a few extension-less relative imports, which
// Metro resolves but Node's strict ESM loader does not. Retry those with ".js".
registerHooks({
    resolve(specifier, context, next) {
        try {
            return next(specifier, context);
        } catch (error) {
            if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.js')) {
                return next(`${specifier}.js`, context);
            }
            throw error;
        }
    }
});

const {
    DynamicScheme,
    Hct,
    MaterialDynamicColors,
    TonalPalette,
    Variant,
    argbFromHex,
    hexFromArgb
} = await import('@material/material-color-utilities');

const root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target  = path.join(root, 'includes', 'Theme.js');
const SEED    = '#be4936';
const seedHct = Hct.fromInt(argbFromHex(SEED));

const palettes = {
    secondary: TonalPalette.fromHueAndChroma(seedHct.hue, 16),
    tertiary:  TonalPalette.fromHueAndChroma(145, 36),
    warning:   TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex('#9a5b00')).hue, 48),
    offline:   TonalPalette.fromHueAndChroma(260, 8)
};

const ROLES = [
    'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'inversePrimary',
    'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
    'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
    'error', 'onError', 'errorContainer', 'onErrorContainer',
    'background', 'onBackground',
    'surface', 'surfaceDim', 'surfaceBright',
    'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
    'surfaceContainerHigh', 'surfaceContainerHighest',
    'onSurface', 'surfaceVariant', 'onSurfaceVariant',
    'inverseSurface', 'inverseOnSurface',
    'outline', 'outlineVariant', 'shadow', 'scrim'
];

const hex = argb => hexFromArgb(argb);

const buildScheme = isDark => {
    const scheme = new DynamicScheme({
        sourceColorHct:   seedHct,
        variant:          Variant.FIDELITY,
        contrastLevel:    0,
        isDark,
        specVersion:      '2021',
        secondaryPalette: palettes.secondary,
        tertiaryPalette:  palettes.tertiary
    });

    const roles = {};
    for (const role of ROLES) {
        roles[role] = hex(MaterialDynamicColors[role].getArgb(scheme));
    }

    const primary = scheme.primaryPalette;

    if (!isDark) {
        roles.primary            = SEED;
        roles.onPrimary          = hex(primary.tone(100));
        roles.primaryContainer   = hex(primary.tone(90));
        roles.onPrimaryContainer = hex(primary.tone(30));
        roles.action             = SEED;
        roles.onAction           = hex(primary.tone(100));
    } else {
        roles.action   = roles.primaryContainer;
        roles.onAction = roles.onPrimaryContainer;
    }

    const pick = (palette, light, dark) => hex(palette.tone(isDark ? dark : light));

    // Fidelity derives secondary/tertiary containers from the primary container tone (≈47),
    // which yields mid-tone fills with barely-AA text. Use the classic MD3 container tones
    // (90/30 light, 30/90 dark) so selection and the "En vivo" chip read as soft tonal fills.
    roles.secondaryContainer   = pick(palettes.secondary, 90, 30);
    roles.onSecondaryContainer = pick(palettes.secondary, 30, 90);
    roles.tertiaryContainer    = pick(palettes.tertiary, 90, 30);
    roles.onTertiaryContainer  = pick(palettes.tertiary, 30, 90);

    roles.success              = pick(palettes.tertiary, 40, 80);
    roles.onSuccess            = pick(palettes.tertiary, 100, 20);
    roles.successContainer     = pick(palettes.tertiary, 90, 30);
    roles.onSuccessContainer   = pick(palettes.tertiary, 30, 90);
    roles.warning              = pick(palettes.warning, 40, 80);
    roles.onWarning            = pick(palettes.warning, 100, 20);
    roles.warningContainer     = pick(palettes.warning, 90, 30);
    roles.onWarningContainer   = pick(palettes.warning, 30, 90);
    roles.offline              = pick(palettes.offline, 40, 80);
    roles.offlineContainer     = pick(palettes.offline, 90, 30);
    roles.onOfflineContainer   = pick(palettes.offline, 30, 90);

    return { roles, neutral: scheme.neutralPalette };
};

const light = buildScheme(false).roles;
const { roles: dark, neutral: darkNeutral } = buildScheme(true);
const watch = {
    background:              '#000000',
    surface:                 '#000000',
    surfaceDim:              '#000000',
    surfaceContainerLowest:  '#000000',
    surfaceContainerLow:     hex(darkNeutral.tone(6)),
    surfaceContainer:        hex(darkNeutral.tone(10)),
    surfaceContainerHigh:    hex(darkNeutral.tone(14)),
    surfaceContainerHighest: hex(darkNeutral.tone(17)),
    surfaceBright:           hex(darkNeutral.tone(22))
};

// --- Contrast report ---------------------------------------------------------------------
const luminance = value => {
    const [ r, g, b ] = [ 1, 3, 5 ].map(i => parseInt(value.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
    const [ hi, lo ] = [ luminance(a), luminance(b) ].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
const PAIRS = [
    [ 'onPrimary', 'primary' ], [ 'onPrimaryContainer', 'primaryContainer' ], [ 'onAction', 'action' ],
    [ 'onSecondaryContainer', 'secondaryContainer' ], [ 'onTertiaryContainer', 'tertiaryContainer' ],
    [ 'primary', 'surface' ], [ 'primary', 'surfaceContainerLow' ], [ 'onSurface', 'surface' ],
    [ 'onSurfaceVariant', 'surfaceContainerHigh' ], [ 'success', 'surface' ],
    [ 'onSuccessContainer', 'successContainer' ], [ 'warning', 'surface' ],
    [ 'onWarningContainer', 'warningContainer' ], [ 'offline', 'surface' ],
    [ 'onOfflineContainer', 'offlineContainer' ], [ 'outline', 'surface' ]
];
const report = (name, roles) => {
    console.log(`\n${name}`);
    for (const [ fg, bg ] of PAIRS) {
        const ratio = contrast(roles[fg], roles[bg]);
        console.log(`  ${ratio < 4.5 ? '!' : ' '} ${fg.padEnd(22)} on ${bg.padEnd(22)} ${ratio.toFixed(2)}:1`);
    }
};
report('light', light);
report('dark', dark);
report('watch', { ...dark, ...watch });

// --- Emit --------------------------------------------------------------------------------
const block = (name, roles, indent = '    ') => {
    const width = Math.max(...Object.keys(roles).map(k => k.length)) + 1;
    const lines = Object.entries(roles).map(([ k, v ]) => `${indent}    ${`${k}:`.padEnd(width + 1)} '${v}'`);
    return `${indent}${name}: {\n${lines.join(',\n')}\n${indent}}`;
};

const START = '// <generated-palette>';
const END   = '// </generated-palette>';
const generated = [
    `${START} Do not edit by hand: run \`node scripts/generate-theme.mjs\`.`,
    `// Seed ${SEED}, MCU Fidelity (spec 2021, contrast 0) + BelgranoWear overrides.`,
    'const palette = {',
    `${block('light', light)},`,
    `${block('dark', dark)},`,
    '    // OLED overrides applied on top of `dark` for WearOS and the web watch preview.',
    block('watch', watch),
    '};',
    END
].join('\n');

if (process.argv.includes('--check')) {
    console.log(`\n${generated}`);
    process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');
const startIndex = source.indexOf(START);
const endIndex = source.indexOf(END);

if (startIndex < 0 || endIndex < 0) {
    console.error(`Markers ${START} / ${END} not found in ${target}.`);
    process.exit(1);
}

fs.writeFileSync(target, source.slice(0, startIndex) + generated + source.slice(endIndex + END.length));
console.log(`\nUpdated ${path.relative(root, target)}`);

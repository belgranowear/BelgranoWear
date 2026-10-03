// Strings for the "watch" area. Owned by a single area to avoid merge conflicts;
// keys must be unique across all partials and Lang.js (later partials win).
//
// Prefixes: `watchUi…` (watch primitives: EdgeButton, CurvedText, RouteHeader) and
// `freshness…` (FreshnessChip, shared by phone and watch). `%s` is replaced by callers.
export default {
    en: {
        // watch primitives
        watchUiRouteFromLabel:        'From',
        watchUiRouteToLabel:          'To',
        watchUiRouteA11yLabel:        'From %s to %s',
        watchUiSwapRouteA11yLabel:    'Reverse route',
        watchUiAddFavoriteA11yLabel:  'Add to favorites',
        watchUiRemoveFavoriteA11yLabel: 'Remove from favorites',

        // freshness chip
        freshnessLiveLabel:           'Live',
        freshnessScheduledLabel:      'Scheduled',
        freshnessOfflineLabel:        'Offline',
        freshnessLiveShortLabel:      'Live',
        freshnessScheduledShortLabel: 'Sched.',
        freshnessOfflineShortLabel:   'Offline',
        freshnessJustNowLabel:        'just now',
        freshnessAgeSecondsLabel:     '%s s ago',
        freshnessAgeMinutesLabel:     '%s min ago',
        freshnessAgeHoursLabel:       '%s h ago',
        freshnessAgeDaysLabel:        '%s d ago',
        freshnessSeparator:           ' · ',

        // wear native (mirrors the Android resources written by plugins/withBelgranoWear.js)
        wearNativeTileName: 'Next train',
        wearNativeComplicationName: 'Next train',
        wearNativeEmpty: 'Open the app to pick a trip',
        wearNativeAddTileHint: 'Add the "Next train" tile and complication from your watch to see it without opening the app.'
    },
    es: {
        // watch primitives
        watchUiRouteFromLabel:        'Desde',
        watchUiRouteToLabel:          'Hacia',
        watchUiRouteA11yLabel:        'Desde %s hacia %s',
        watchUiSwapRouteA11yLabel:    'Invertir ruta',
        watchUiAddFavoriteA11yLabel:  'Agregar a favoritos',
        watchUiRemoveFavoriteA11yLabel: 'Quitar de favoritos',

        // freshness chip
        freshnessLiveLabel:           'En vivo',
        freshnessScheduledLabel:      'Horario',
        freshnessOfflineLabel:        'Sin conexión',
        freshnessLiveShortLabel:      'Vivo',
        freshnessScheduledShortLabel: 'Horario',
        freshnessOfflineShortLabel:   'Sin red',
        freshnessJustNowLabel:        'recién',
        freshnessAgeSecondsLabel:     'hace %s s',
        freshnessAgeMinutesLabel:     'hace %s min',
        freshnessAgeHoursLabel:       'hace %s h',
        freshnessAgeDaysLabel:        'hace %s d',
        freshnessSeparator:           ' · ',

        // wear native (mirrors the Android resources written by plugins/withBelgranoWear.js)
        wearNativeTileName: 'Próximo tren',
        wearNativeComplicationName: 'Próximo tren',
        wearNativeEmpty: 'Abrí la app para elegir un viaje',
        wearNativeAddTileHint: 'Agregá la tarjeta y la complicación "Próximo tren" desde el reloj para verlo sin abrir la app.'
    }
};

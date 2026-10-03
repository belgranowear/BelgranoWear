// Strings for the "watch" area. Owned by a single area to avoid merge conflicts;
// keys must be unique across all partials and Lang.js (later partials win).
export default {
    en: {
        // wear native (mirrors the Android resources written by plugins/withBelgranoWear.js)
        wearNativeTileName: 'Next train',
        wearNativeComplicationName: 'Next train',
        wearNativeEmpty: 'Open the app to pick a trip',
        wearNativeAddTileHint: 'Add the "Next train" tile and complication from your watch to see it without opening the app.'
    },
    es: {
        // wear native (mirrors the Android resources written by plugins/withBelgranoWear.js)
        wearNativeTileName: 'Próximo tren',
        wearNativeComplicationName: 'Próximo tren',
        wearNativeEmpty: 'Abrí la app para elegir un viaje',
        wearNativeAddTileHint: 'Agregá la tarjeta y la complicación "Próximo tren" desde el reloj para verlo sin abrir la app.'
    }
};

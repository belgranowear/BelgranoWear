// Strings for the "live" area. Owned by a single area to avoid merge conflicts;
// keys must be unique across all partials and Lang.js (later partials win).
// `liveWidget*` strings are copied into the trip snapshot for native widgets/tiles, which
// replace `{n}` themselves (not an i18n-js placeholder on purpose).
export default {
    en: {
        liveTripChannelName: 'Trip tracking',
        liveTripChannelDescription: 'Ongoing notification while you follow a train.',
        liveTripTitle: '%{origin} → %{destination}',
        liveTripDepartsIn: 'Departs %{time} · in %{minutes} min',
        liveTripDepartsNow: 'Departs %{time} · now',
        liveTripDeparted: 'Departed %{time}',
        liveTripArrives: 'Arrives %{time}',
        liveTripNextStation: 'Next: %{station}',
        liveTripShortMinutes: '%{minutes} min',
        liveTripShortNow: 'Now',
        liveTripStop: 'Stop tracking',
        liveTripOpen: 'Open',
        liveSourceLive: 'Live',
        liveSourceScheduled: 'Scheduled',
        liveSourceOffline: 'Offline',
        liveWidgetNextTrain: 'Next train',
        liveWidgetInMinutes: 'in {n} min',
        liveWidgetNow: 'now',
        liveWidgetAgoSeconds: '{n} s ago',
        liveWidgetAgoMinutes: '{n} min ago',
        liveWidgetOpenApp: 'Open the app to see upcoming trains',
        liveWidgetNoMoreTrains: 'No more trains for now'
    },
    es: {
        liveTripChannelName: 'Seguimiento de viaje',
        liveTripChannelDescription: 'Notificación fija mientras seguís un tren.',
        liveTripTitle: '%{origin} → %{destination}',
        liveTripDepartsIn: 'Sale %{time} · en %{minutes} min',
        liveTripDepartsNow: 'Sale %{time} · ahora',
        liveTripDeparted: 'Salió %{time}',
        liveTripArrives: 'Llega %{time}',
        liveTripNextStation: 'Próxima: %{station}',
        liveTripShortMinutes: '%{minutes} min',
        liveTripShortNow: 'Ahora',
        liveTripStop: 'Dejar de seguir',
        liveTripOpen: 'Abrir',
        liveSourceLive: 'En vivo',
        liveSourceScheduled: 'Programado',
        liveSourceOffline: 'Sin conexión',
        liveWidgetNextTrain: 'Próximo tren',
        liveWidgetInMinutes: 'en {n} min',
        liveWidgetNow: 'ahora',
        liveWidgetAgoSeconds: 'hace {n} s',
        liveWidgetAgoMinutes: 'hace {n} min',
        liveWidgetOpenApp: 'Abrí la app para ver los próximos trenes',
        liveWidgetNoMoreTrains: 'No hay más trenes por ahora'
    }
};

import { Platform } from 'react-native';

const mockStations = [
    { id: '1',  title: 'Retiro' },
    { id: '4',  title: 'Ciudad Universitaria' },
    { id: '8',  title: 'Boulogne Sur Mer' },
    { id: '12', title: 'Grand Bourg' },
    { id: '14', title: 'Los Polvorines' },
    { id: '16', title: 'Del Viso' },
    { id: '18', title: 'Villa Rosa' }
];

export const previewRoute = {
    origin:      mockStations[2],
    destination: mockStations[0]
};

export const previewParams = {
    ...previewRoute,
    segmentsList: {
        1: 'Lunes a viernes',
        2: 'Sábado',
        3: 'Domingo y feriado'
    },
    holidaysList: []
};

export const previewState = {
    stations: mockStations,
    origin: previewRoute.origin,
    favorites: [
        { id: '8:1', origin: mockStations[2], destination: mockStations[0], updatedAt: Date.now() },
        { id: '8:18', origin: mockStations[2], destination: mockStations[6], updatedAt: Date.now() }
    ],
    recents: [
        { id: '8:12', origin: mockStations[2], destination: mockStations[3], updatedAt: Date.now() }
    ]
};

export function getUIPreviewMode() {
    if (Platform.OS !== 'web' || typeof window === 'undefined') { return null; }

    const params = new URLSearchParams(window.location.search);

    return params.get('uiPreview');
}

export function isUIPreview(mode) {
    return getUIPreviewMode() === mode;
}

export function isAnyUIPreview() {
    return getUIPreviewMode() !== null;
}

export function isWatchUIPreview() {
    const mode = getUIPreviewMode();

    return mode === 'watch' || mode?.indexOf('watch-') === 0;
}

export function getInitialRouteNameForPreview() {
    const mode = getUIPreviewMode();

    if (mode === 'schedule' || mode === 'watch' || mode === 'watch-schedule') { return 'NextSchedule'; }

    return 'DestinationPicker';
}

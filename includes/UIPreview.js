import { Platform } from 'react-native';

// IDs and titles mirror the production availability_options.json keys.
const mockStations = [
    { id: '1',  title: 'Retiro' },
    { id: '3',  title: 'C. Universitaria' },
    { id: '10', title: 'Boulogne Sur Mer' },
    { id: '17', title: 'Grand Bourg' },
    { id: '15', title: 'Los Polvorines' },
    { id: '21', title: 'Del Viso' },
    { id: '23', title: 'Villa Rosa' }
];

const PREVIEW_MODES = [
    'picker',
    'manual',
    'loading',
    'schedule',
    'watch',
    'watch-picker',
    'watch-manual',
    'watch-loading',
    'watch-schedule'
];

export const previewRoute = {
    origin:      mockStations[2],
    destination: mockStations[0]
};

export const previewParams = {
    ...previewRoute,
    segmentsList: {
        1: 'Lunes a Viernes',
        2: 'Sábados',
        3: 'Domingos y Feriados'
    },
    holidaysList: []
};

export const previewState = {
    stations: mockStations,
    origin: previewRoute.origin,
    favorites: [
        { id: '10:1',  origin: mockStations[2], destination: mockStations[0], updatedAt: Date.now() },
        { id: '10:23', origin: mockStations[2], destination: mockStations[6], updatedAt: Date.now() }
    ],
    recents: [
        { id: '10:17', origin: mockStations[2], destination: mockStations[3], updatedAt: Date.now() }
    ]
};

const isUIPreviewEnabled = () => {
    if (typeof(__DEV__) !== 'undefined' && __DEV__) { return true; }

    try {
        return process.env.EXPO_PUBLIC_ENABLE_UI_PREVIEW === 'true';
    } catch (exception) {
        return false;
    }
};

export function getUIPreviewMode() {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isUIPreviewEnabled()) { return null; }

    const mode = new URLSearchParams(window.location.search).get('uiPreview');

    return PREVIEW_MODES.indexOf(mode) > -1 ? mode : null;
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

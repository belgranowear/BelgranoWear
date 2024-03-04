import * as Localization  from 'expo-localization';
import { I18n }           from 'i18n-js';

const Lang    = new I18n();
const locales = Localization.getLocales();

Lang.defaultLocale = 'en';
Lang.locale        = Lang.defaultLocale;

if (
    locales.length > 0
    &&
    typeof(locales[0]) != 'undefined'
) {
    Lang.locale = locales[0].languageCode;
} else {
    console.warn(`No locales detected, falling back to ${Lang.defaultLocale}.`);
}

Lang.enableFallback = true;
Lang.translations   = {
    en: {
        to: 'to',
        from: 'from',
        selectDestinationHint: 'Select a destination',
        goBackBtnLabel: 'Go back',
        noTripsFoundMessage: 'No trips found, please try again tomorrow.',
        hour: 'hour',
        hours: 'hours',
        minute: 'minute',
        minutes: 'minutes',
        second: 'second',
        seconds: 'seconds',
        remaining: 'remaining',
        and: 'and',
        nextTripMessage: 'Your next trip from',
        nextTripScheduleForMessage: 'is scheduled for',
        nextTripRemainingTimeMessage: '%s remaining',
        hurryUpMessage: 'Hurry up! The train is arriving in a few seconds.',
        fetchingTrainStationsMapMessage: 'Fetching train stations map',
        fetchingHolidaysListMessage: 'Fetching holidays list',
        fetchingAvailabilityOptionsMessage: 'Fetching availability options',
        detectingOriginStationMessage: 'Detecting origin station',
        locationAccessDeniedMessage: 'Location access is required, please enable it from the device settings.',
        locationUnknownErrorMessage: 'An unknown error prevented location access, please contact the developer.',
        originDetectionErrorMessage: 'Couldn\'t detect origin train station.',
        offlineModeHint: 'Offline',
        offlineModeInfoMessage: 'You\'re currently offline, schedule results will be loaded from memory until you\'re back online.',
        gotItBtnLabel: 'Got it',
        alternativeTripStartTimeMessage: 'Or you can take the next one at',
        fetchTrainStationsMapError: 'A connection error has occured while trying to fetch the train stations map, please try again later.',
        fetchHolidaysListError: 'A connection error has occured while trying to fetch the holidays list, please try again later.',
        fetchAvailabilityOptionsError: 'A connection error has occured while trying to fetch the availability options, please try again later.',
        getTargetSegmentError: 'Couldn\'t detect a compatible schedule segment for the current date, please try again later.',
        fetchNextTripTimeError: 'A connection error has occured while trying to fetch the next trip time, please try again later.',
        verifyCachedResourcesMessage: 'Checking for updates'
    },
    es: {
        to: 'a',
        from: 'desde',
        selectDestinationHint: 'Seleccione un destino',
        goBackBtnLabel: 'Volver',
        noTripsFoundMessage: 'No se encontraron viajes, volvé a intentarlo mañana.',
        hour: 'hora',
        hours: 'horas',
        minute: 'minuto',
        minutes: 'minutos',
        second: 'segundo',
        seconds: 'segundos',
        remaining: 'resantes',
        and: 'y',
        nextTripMessage: 'Tu viaje de',
        nextTripScheduleForMessage: 'está programado para las',
        nextTripRemainingTimeMessage: 'faltan %s',
        hurryUpMessage: '¡Apuráte! El tren llegará en unos pocos segundos.',
        fetchingTrainStationsMapMessage: 'Obteniendo mapa de estaciones',
        fetchingHolidaysListMessage: 'Obteniendo lista de feriados',
        fetchingAvailabilityOptionsMessage: 'Obteniendo opciones de disponibilidad',
        detectingOriginStationMessage: 'Detectando estación de origen',
        locationAccessDeniedMessage: 'El acceso a la ubicación es necesario, por favor, habilitálo desde los ajustes del dispositivo.',
        locationUnknownErrorMessage: 'Un error desconocido provocó que no se pudiera acceder a la ubicación, por favor, contactá al desarrollador.',
        originDetectionErrorMessage: 'No se pudo detectar la estación de origen.',
        offlineModeHint: 'Sin conexión',
        offlineModeInfoMessage: 'No tenés conexión a internet, verás resultados almacenados en la memoria hasta que vuelvas a estar en línea.',
        gotItBtnLabel: 'Entendido',
        alternativeTripStartTimeMessage: 'O podés tomar el siguiente a las',
        fetchTrainStationsMapError: 'Ocurrió un error de conexión al intentar obtener el mapa de estaciones de tren, por favor, volvé a intentarlo más tarde.',
        fetchHolidaysListError: 'Ocurrió un error de conexión al intentar obtener la lista de feriados, por favor, volvé a intentarlo más tarde.',
        fetchAvailabilityOptionsError: 'Ocurrió un error de conexión al intentar obtener la lista de opciones de disponibilidad, por favor, volvé a intentarlo más tarde.',
        getTargetSegmentError: 'No se pudo detectar un segmento de tarifa compatible con la fecha actual, por favor, volvé a intentarlo más tarde.',
        fetchNextTripTimeError: 'Ocurrió un error de conexión al intentar obtener la hora del próximo viaje, por favor, volvé a intentarlo más tarde.',
        verifyCachedResourcesMessage: 'Comprobando actualizaciones'
    }
}

console.log('locale:', Lang.locale);

export default Lang;
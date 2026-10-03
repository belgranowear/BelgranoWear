import dayjs from 'dayjs';
import utc   from 'dayjs/plugin/utc';

dayjs.extend(utc);

// Línea Belgrano timetables are published in Argentina local time (UTC-3, no DST).
export const ARGENTINA_UTC_OFFSET_MINUTES = -180;

export const nowInArgentina = () => dayjs().utcOffset(ARGENTINA_UTC_OFFSET_MINUTES);

export default { ARGENTINA_UTC_OFFSET_MINUTES, nowInArgentina };

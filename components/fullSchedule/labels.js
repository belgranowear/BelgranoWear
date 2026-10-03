// Localized labels shared by the phone and watch layouts of the full schedule.

import Lang from '../../includes/Lang';

import { SEGMENT_KIND, durationMinutes, formatTime } from './model';

const SEGMENT_LABEL_KEYS = {
    [SEGMENT_KIND.WEEKDAY]:  'fullScheduleSegmentWeekday',
    [SEGMENT_KIND.SATURDAY]: 'fullScheduleSegmentSaturday',
    [SEGMENT_KIND.HOLIDAY]:  'fullScheduleSegmentHoliday'
};

export const segmentLabel = (segment, short = false) => {
    if (!segment) { return ''; }

    const key = SEGMENT_LABEL_KEYS[segment.kind];

    return key ? Lang.t(short ? `${key}Short` : key) : segment.name;
};

export const formatDate = date => {
    const months = String(Lang.t('fullScheduleMonths')).split(',');

    return Lang.t('fullScheduleDateFormat', { day: date.date(), month: months[date.month()] || '' });
};

// "Hoy es día hábil · 3 de octubre"
export const todayLabel = today => {
    let key = 'fullScheduleTodayWeekday';

    if (today.isHoliday) { key = 'fullScheduleTodayHoliday'; }
    else if (today.dayOfWeek === 0) { key = 'fullScheduleTodaySunday'; }
    else if (today.dayOfWeek === 6) { key = 'fullScheduleTodaySaturday'; }

    return `${Lang.t(key)} · ${formatDate(today.date)}`;
};

// Holiday notice for today (preferred) or tomorrow; null when neither is a holiday.
export const holidayNotice = today => {
    if (today.isHoliday) { return Lang.t('fullScheduleTodayHolidayNotice'); }
    if (today.isTomorrowHoliday) { return Lang.t('fullScheduleTomorrowHolidayNotice'); }

    return null;
};

export const minutesLabel = totalMinutes => {
    const minutes = Math.max(0, Math.round(totalMinutes));

    if (minutes < 60) { return Lang.t('fullScheduleMinutesShort', { minutes }); }

    return Lang.t('fullScheduleHoursMinutesShort', {
        hours:   Math.floor(minutes / 60),
        minutes: String(minutes % 60).padStart(2, '0')
    });
};

// "en 13 min" / "en 1 h 05 min"
export const waitLabel = (trip, now) => Lang.t('fullScheduleIn', {
    time: minutesLabel(Math.ceil((trip.departure.valueOf() - now.valueOf()) / 60000))
});

// "07:40 → 08:18 · 38 min" (departure only when the row has no arrival).
export const tripLabel = trip => {
    const minutes = durationMinutes(trip);

    if (!trip.arrival) { return formatTime(trip.departure); }

    return `${formatTime(trip.departure)} → ${formatTime(trip.arrival)} · ${Lang.t('fullScheduleMinutesShort', { minutes })}`;
};

// "Sale 07:40, llega 08:18, 38 minutos, ya pasó"
export const tripA11yLabel = item => {
    const { trip } = item;
    const parts    = [
        trip.arrival
            ? Lang.t('fullScheduleRowA11y', { departure: formatTime(trip.departure), arrival: formatTime(trip.arrival), minutes: durationMinutes(trip) })
            : Lang.t('fullScheduleRowA11yNoArrival', { departure: formatTime(trip.departure) })
    ];

    if (item.isPast) { parts.push(Lang.t('fullScheduleRowA11yPast')); }
    if (item.isNext) { parts.push(Lang.t('fullScheduleRowA11yNext')); }

    return parts.join(', ');
};

export const trainCountLabel = count => (
    count === 1 ? Lang.t('fullScheduleTrainCountOne') : Lang.t('fullScheduleTrainCount', { count })
);

// Pure data helpers for the F3 "Horario completo" screen: segment classification,
// hour grouping, "Ahora" placement, fixed-height list layout and preview data.

import normalizeSpecialCharacters from 'specialtonormal';

import { buildTrips, findTargetSegmentId } from '../../includes/Schedule';

export const SEGMENT_KIND = {
    WEEKDAY:  'weekday',
    SATURDAY: 'saturday',
    HOLIDAY:  'holiday'
};

const KIND_ORDER = [ SEGMENT_KIND.WEEKDAY, SEGMENT_KIND.SATURDAY, SEGMENT_KIND.HOLIDAY ];

// "Lunes a Viernes" → weekday, "Sábados" → saturday, "Domingos y Feriados" → holiday.
export const classifySegment = name => {
    const normalized = normalizeSpecialCharacters(String(name || '').toLowerCase());

    if (normalized.indexOf('feriado') > -1 || normalized.indexOf('domingo') > -1) { return SEGMENT_KIND.HOLIDAY; }
    if (normalized.indexOf('sabado') > -1) { return SEGMENT_KIND.SATURDAY; }

    return SEGMENT_KIND.WEEKDAY;
};

// `[{ id, name, kind }]` ordered weekday → saturday → holiday (unknown names keep their order).
export const listSegments = segmentsList => Object.keys(segmentsList || {})
    .map((id, index) => ({ id: String(id), name: String(segmentsList[id]), kind: classifySegment(segmentsList[id]), index }))
    .sort((first, second) => (KIND_ORDER.indexOf(first.kind) - KIND_ORDER.indexOf(second.kind)) || (first.index - second.index));

// Days from `now` until the first day (within a week) whose segment is `segmentId`; 0 when not found.
export const findSegmentDayOffset = (now, segmentId, segmentsList, holidaysList) => {
    for (let offset = 0; offset < 8; offset++) {
        if (String(findTargetSegmentId(now.add(offset, 'day'), segmentsList, holidaysList)) === String(segmentId)) { return offset; }
    }

    return 0;
};

export const durationMinutes = trip => (
    trip.arrival ? Math.max(0, Math.round((trip.arrival.valueOf() - trip.departure.valueOf()) / 60000)) : null
);

export const formatTime = instant => (instant ? instant.format('HH:mm') : '--:--');

// Trips of a segment on the given day, all of them (past included).
export const buildDayTrips = (now, dayOffset, options) => buildTrips(now, dayOffset, options, { onlyUpcoming: false });

// Index of the first trip that has not left yet (trips.length when all left, -1 when not today).
export const findNextTripIndex = (trips, now, isToday) => {
    if (!isToday) { return -1; }

    const index = trips.findIndex(trip => trip.departure.valueOf() > now.valueOf());

    return index === -1 ? trips.length : index;
};

/**
 * Groups trips by departure hour as SectionList sections. Items are
 * `{ type: 'trip', key, trip, index, isPast, isNext }` plus a single
 * `{ type: 'now', key }` divider placed before the next trip when `nextIndex > -1`.
 */
export const buildSections = (trips, nextIndex) => {
    const sections = [];
    let   current  = null;

    trips.forEach((trip, index) => {
        const hour = trip.departure.hour();

        if (!current || current.hour !== hour) {
            current = { key: `hour-${index}-${hour}`, hour, title: `${String(hour).padStart(2, '0')} h`, data: [] };
            sections.push(current);
        }

        if (index === nextIndex) { current.data.push({ type: 'now', key: 'now' }); }

        current.data.push({
            type:   'trip',
            key:    `trip-${index}`,
            trip,
            index,
            isPast: nextIndex > -1 && index < nextIndex,
            isNext: index === nextIndex
        });
    });

    if (current && nextIndex > -1 && nextIndex >= trips.length) { current.data.push({ type: 'now', key: 'now' }); }

    return sections;
};

// Position of the item to scroll to for "Ir a ahora": the "Ahora" divider of the section.
export const findNowLocation = sections => {
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
        const itemIndex = sections[sectionIndex].data.findIndex(item => item.type === 'now');

        if (itemIndex > -1) { return { sectionIndex, itemIndex }; }
    }

    return null;
};

/**
 * Frame table for SectionList#getItemLayout. VirtualizedList flattens every section as
 * header, items…, footer (footer has zero height here). `headerOffset` is the height of
 * ListHeaderComponent, which VirtualizedList does not add on its own.
 */
export const buildFrames = (sections, { headerHeight, rowHeight, nowHeight, headerOffset = 0 }) => {
    const frames = [];
    let   offset = headerOffset;

    const push = length => {
        frames.push({ length, offset, index: frames.length });
        offset += length;
    };

    sections.forEach(section => {
        push(headerHeight);
        section.data.forEach(item => push(item.type === 'now' ? nowHeight : rowHeight));
        push(0);
    });

    return frames;
};

// Deterministic timetable for the web UI preview modes (no network): 04:12 → 23:48, ~38 min trips.
export const buildPreviewOptions = segmentId => {
    const step    = String(segmentId) === '1' ? 22 : (String(segmentId) === '2' ? 30 : 40);
    const options = [];

    for (let minutes = 4 * 60 + 12; minutes <= 23 * 60 + 48; minutes += step) {
        const arrival = minutes + 38;
        const pad     = value => String(value).padStart(2, '0');

        options.push([
            `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
            `${pad(Math.floor(arrival / 60) % 24)}:${pad(arrival % 60)}`
        ]);
    }

    return options;
};

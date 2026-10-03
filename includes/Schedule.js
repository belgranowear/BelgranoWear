// Schedule data layer shared by every screen and native surface that shows trains:
// segment (weekday/saturday/sunday-holiday) resolution, static schedule rows, and the
// live ETA scraped from the Ferrovías station board.
//
// Static schedule rows come from `schedule_{segment}.{originId}.{destinationId}_data.json`
// and look like `[ "HH:mm departure", "HH:mm arrival" ]` (older rows may be a bare "HH:mm").
// Station ids 1–23 follow line order: 1 Retiro … 10 Boulogne Sur Mer … 23 Villa Rosa.

import normalizeSpecialCharacters from 'specialtonormal';

import IDomParser from 'advanced-html-parser';

import dayjs from 'dayjs';

import Cache from './Cache';
import { fetchWithTimeout } from './Network';
import { ARGENTINA_UTC_OFFSET_MINUTES } from './Time';

export const SOURCE = {
  LIVE:      'live',
  SCHEDULED: 'scheduled',
  OFFLINE:   'offline'
};

export const LIVE_ETA_EARLIEST_OFFSET_MIN = -5;
export const LIVE_ETA_LATEST_OFFSET_MIN   = 30;
export const DEFAULT_SEGMENTS_LIST        = { 1: 'Lunes a viernes', 2: 'Sábado', 3: 'Domingo' };

// Argentina wall clock of an instant, read through UTC getters so device DST rules never leak in.
export const toArgentinaWallClock = instant => new Date(instant.valueOf() + ARGENTINA_UTC_OFFSET_MINUTES * 60 * 1000);

// Builds an absolute instant from an Argentina wall-clock time, independent of the device time zone.
export const atArgentinaWallTime = (reference, dayOffset = 0, hour = 0, minute = 0) => {
  const wallClock = toArgentinaWallClock(reference);

  return dayjs.utc(
    Date.UTC(wallClock.getUTCFullYear(), wallClock.getUTCMonth(), wallClock.getUTCDate() + dayOffset, hour, minute) - ARGENTINA_UTC_OFFSET_MINUTES * 60 * 1000
  ).utcOffset(ARGENTINA_UTC_OFFSET_MINUTES);
};

export const isSameArgentinaDay = (first, second) => (
  toArgentinaWallClock(first).toISOString().slice(0, 10) === toArgentinaWallClock(second).toISOString().slice(0, 10)
);

export const isHolidayDate = (date, holidaysList) => (holidaysList || []).some(holiday => (
  holiday.dia == date.date() && holiday.mes == date.month() + 1
));

export const findTargetSegmentId = (date, segmentsList, holidaysList) => {
  const segmentIds   = Object.keys(segmentsList || {});
  const segmentNames = segmentIds.map(id => normalizeSpecialCharacters(String(segmentsList[id]).toLowerCase()));
  const dayOfWeek    = date.day();

  if (isHolidayDate(date, holidaysList)) {
    const holidayIndex = segmentNames.findIndex(name => name.indexOf('feriado') > -1);
    if (holidayIndex > -1) { return segmentIds[holidayIndex]; }
  }

  for (let index = 0; index < segmentIds.length; index++) {
    const segmentName = segmentNames[index];
    const isWeekend   = [ 'sabado', 'domingo', 'feriado' ].some(word => segmentName.indexOf(word) > -1);

    if (dayOfWeek == 0 && segmentName.indexOf('domingo') > -1) { return segmentIds[index]; }
    if (dayOfWeek == 6 && segmentName.indexOf('sabado') > -1) { return segmentIds[index]; }
    if (dayOfWeek > 0 && dayOfWeek < 6 && !isWeekend) { return segmentIds[index]; }
  }

  return null;
};

const parseWallTime = value => {
  const [ hour, minute ] = String(value || '').split(':').map(part => parseInt(part, 10));

  return Number.isNaN(hour) || Number.isNaN(minute) ? null : { hour, minute };
};

// Every trip of `options` on the day `dayOffset` days after `now`, as `{ departure, arrival }`
// dayjs instants sorted by departure. `arrival` is null when the row has no arrival time; an
// arrival earlier than its departure is treated as past midnight. With `onlyUpcoming`, trips
// that already left (departure <= now) are dropped.
export const buildTrips = (now, dayOffset, options, { onlyUpcoming = true } = {}) => {
  const trips = [];

  (Array.isArray(options) ? options : []).forEach(option => {
    const [ departureText, arrivalText ] = Array.isArray(option) ? option : [ option ];
    const departureTime = parseWallTime(departureText);

    if (!departureTime) { return; }

    const departure = atArgentinaWallTime(now, dayOffset, departureTime.hour, departureTime.minute);

    if (onlyUpcoming && departure.valueOf() <= now.valueOf()) { return; }

    const arrivalTime = parseWallTime(arrivalText);
    let   arrival     = arrivalTime ? atArgentinaWallTime(now, dayOffset, arrivalTime.hour, arrivalTime.minute) : null;

    if (arrival && arrival.valueOf() < departure.valueOf()) { arrival = arrival.add(1, 'day'); }

    trips.push({ departure, arrival });
  });

  return trips.sort((first, second) => first.departure.valueOf() - second.departure.valueOf());
};

// Departures of `options` on the day `dayOffset` days after `now`, strictly after `now`.
export const buildDepartureTimes = (now, dayOffset, options) => buildTrips(now, dayOffset, options).map(trip => trip.departure);

export const scheduleUrl = (segment, originId, destinationId) => (
  process.env.REMOTE_BASE_URL + `/schedule_${segment}.${originId}.${destinationId}_data.json`
);

// Static schedule rows for one segment and route: network first, cache as fallback.
// Resolves to `{ options, source }` (SOURCE.SCHEDULED or SOURCE.OFFLINE) or null.
export const fetchScheduleOptions = async (segment, originId, destinationId) => {
  const url = scheduleUrl(segment, originId, destinationId);

  try {
    const json = await (await fetchWithTimeout(url)).json();
    Cache.set(url, json);
    return { options: json, source: SOURCE.SCHEDULED };
  } catch (exception) {
    const cachedData = await Cache.get(url);

    if (cachedData) { return { options: cachedData, source: SOURCE.OFFLINE }; }

    console.warn('Schedule: couldn\'t query', url, exception);
    return null;
  }
};

// Station ids in line order between two stations (inclusive), e.g. (10, 1) → [10, 9, …, 1].
export const stationIdsBetween = (originId, destinationId) => {
  const from = parseInt(originId, 10);
  const to   = parseInt(destinationId, 10);
  const step = to >= from ? 1 : -1;
  const ids  = [];

  if (Number.isNaN(from) || Number.isNaN(to)) { return ids; }

  for (let id = from; step > 0 ? id <= to : id >= to; id += step) { ids.push(id); }

  return ids;
};

/* Live ETA (Ferrovías station board) */

const normalizeLiveStationName = name => normalizeSpecialCharacters(String(name || '').toLowerCase()).replace(/\s+/g, ' ').trim();

// Live stations are listed in line order (Retiro → Villa Rosa); returns -1 when the name can't be mapped.
export const findLiveStationIndex = (liveStationsList, name) => {
  const normalizedName = normalizeLiveStationName(name);
  const liveNames      = liveStationsList.map(station => normalizeLiveStationName(station.name));
  let   stationIndex   = liveNames.indexOf(normalizedName);

  if (stationIndex > -1 || normalizedName.length === 0) { return stationIndex; }

  liveNames.forEach((liveName, index) => {
    const liveNameWord = liveName.replace(/.* /, '');
    if (normalizedName === liveNameWord || normalizedName.indexOf(' ' + liveNameWord) > -1) { stationIndex = index; }
  });

  return stationIndex;
};

export const findLiveDirectionTable = (body, liveStationsList, originIndex, destinationIndex) => {
  const isGoingUp = destinationIndex > originIndex;
  const tables    = [];

  for (let index = 0; index < body.children.length; index++) {
    const child = body.children[index];

    if (child.nodeType !== 1 || !child.tagName || child.tagName.toLowerCase() != 'table') { continue; }
    if ((child.outerHTML || '').trim().length > 0) { tables.push(child); }
  }

  const titledTable = tables.find(table => {
    const title      = table.querySelector('.table_title');
    const titleIndex = title ? findLiveStationIndex(liveStationsList, title.innerText()) : -1;

    return titleIndex > -1 && titleIndex !== originIndex && (titleIndex > originIndex) === isGoingUp;
  });

  if (titledTable) { return titledTable; }

  return isGoingUp ? tables[0] : tables[tables.length - 1];
};

export const parseLiveDepartureRows = table => {
  const rows       = [];
  let terminalName = null;

  Array.from(table.querySelectorAll('.tdEst') || []).forEach(cell => {
    const classNames = String(cell.getAttribute('class') || '').split(/\s+/);
    const text       = cell.innerText().trim();

    if (classNames.indexOf('tdflecha') === -1) {
      terminalName = text;
      return;
    }

    const minutes = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!Number.isNaN(minutes)) { rows.push({ terminalName, minutes }); }
    terminalName = null;
  });

  return rows;
};

// First live train that reaches the destination and plausibly matches the scheduled departure.
export const pickLiveDeparture = ({ rows, liveStationsList, originIndex, destinationIndex, scheduledDeparture, followingDeparture, now }) => {
  const isGoingUp = destinationIndex > originIndex;

  for (let index = 0; index < rows.length; index++) {
    const terminalIndex = findLiveStationIndex(liveStationsList, rows[index].terminalName);

    if (terminalIndex < 0) { continue; }
    if (isGoingUp ? terminalIndex < destinationIndex : terminalIndex > destinationIndex) { continue; }

    const departure     = now.add(rows[index].minutes, 'minute');
    const offsetMinutes = (departure.valueOf() - scheduledDeparture.valueOf()) / 60000;

    if (offsetMinutes < LIVE_ETA_EARLIEST_OFFSET_MIN || offsetMinutes > LIVE_ETA_LATEST_OFFSET_MIN) { continue; }
    if (followingDeparture && departure.valueOf() >= followingDeparture.valueOf()) { continue; }

    return departure;
  }

  return null;
};

// Live station list `[{ id, name }]` in line order, read from the board's main table.
export const fetchLiveStationsList = async () => {
  const html = await (await fetchWithTimeout(process.env.HIGH_ACCURACY_ETA_URL)).text();
  const dom  = IDomParser.parse(html);

  const mainTables       = dom.querySelectorAll('#table_main');
  const mainTable        = mainTables[ mainTables.length - 1 ];
  const expectedTdCount  = mainTable.querySelector('tr').querySelectorAll('td').length;
  const liveStationsList = [];

  for (let currentRowIndex = 0; currentRowIndex < expectedTdCount; currentRowIndex++) {
    mainTable.querySelectorAll('tr').forEach(tr => {
      const td = tr.querySelectorAll('td')[currentRowIndex];
      if (!td) { return; }
      const id = String(td.getAttribute('onclick') || '').replace(new RegExp('[^0-9]', 'g'), '').trim();
      if (id.length > 0) { liveStationsList.push({ id: parseInt(id), name: td.innerText() }); }
    });
  }

  return liveStationsList;
};

// Live rows `[{ terminalName, minutes }]` for trains leaving `originIndex` towards `destinationIndex`.
export const fetchLiveRows = async (liveStationsList, originIndex, destinationIndex) => {
  const response = await fetchWithTimeout(process.env.HIGH_ACCURACY_ETA_URL + '/estaciones.asp', {
    method:  'POST',
    body:    new URLSearchParams({ idEst: liveStationsList[originIndex].id }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const dom   = IDomParser.parse(await response.text());
  const table = findLiveDirectionTable(dom.querySelector('body'), liveStationsList, originIndex, destinationIndex);

  return table ? parseLiveDepartureRows(table) : [];
};

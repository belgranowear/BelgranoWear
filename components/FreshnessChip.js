import React from 'react';

import Lang from '../includes/Lang';
import { SOURCE } from '../includes/Schedule';

import { StatusPill } from './ui';

/**
 * Tells the user where a departure time comes from and how fresh it is:
 * live board ("En vivo"), static schedule ("Horario") or offline cache ("Sin conexión · hace N min").
 * Contract (stub — owned by the watch primitives / shared components area):
 *
 * @param {object} props
 * @param {'live'|'scheduled'|'offline'} props.source   One of `SOURCE` from includes/Schedule.
 * @param {number|Date|object} [props.fetchedAt]        When the data was fetched (ms, Date or dayjs).
 * @param {boolean} [props.compact]                     Icon-only variant for watch / dense rows.
 * @param {object}  [props.style]
 */
export default function FreshnessChip({ source, fetchedAt, compact, style }) {
    const tone = source === SOURCE.LIVE ? 'success' : source === SOURCE.OFFLINE ? 'offline' : 'neutral';

    return <StatusPill label={String(source || '')} tone={tone} style={style} />;
}

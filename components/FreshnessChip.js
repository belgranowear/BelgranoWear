import React, { useEffect, useState } from 'react';

import { StyleSheet, View } from 'react-native';

import { Icon, Text } from 'react-native-paper';

import Lang from '../includes/Lang';
import { SOURCE } from '../includes/Schedule';
import { useTheme } from '../includes/Theme';

const SOURCE_META = {
    [SOURCE.LIVE]:      { icon: 'access-point',      label: 'freshnessLiveLabel',      shortLabel: 'freshnessLiveShortLabel' },
    [SOURCE.SCHEDULED]: { icon: 'clock-outline',     label: 'freshnessScheduledLabel', shortLabel: 'freshnessScheduledShortLabel' },
    [SOURCE.OFFLINE]:   { icon: 'cloud-off-outline', label: 'freshnessOfflineLabel',   shortLabel: 'freshnessOfflineShortLabel' }
};

const toMillis = value => {
    if (value === null || typeof(value) === 'undefined') { return null; }

    const millis = typeof(value) === 'number' ? value : Number(value.valueOf());

    return Number.isFinite(millis) ? millis : null;
};

/**
 * Relative age of `fetchedAt` ("hace 20 s", "hace 3 min", "hace 2 h"), or `null` when it
 * should not be shown. Seconds are only shown for live data (where they matter); other
 * sources start at one minute.
 */
export function formatFreshnessAge(fetchedAt, source, now = Date.now()) {
    const millis = toMillis(fetchedAt);

    if (millis === null) { return null; }

    const seconds = Math.max(0, Math.floor((now - millis) / 1000));

    if (seconds < 60) {
        if (source !== SOURCE.LIVE) { return null; }
        if (seconds < 10)           { return Lang.t('freshnessJustNowLabel'); }

        return Lang.t('freshnessAgeSecondsLabel').replace('%s', String(Math.floor(seconds / 10) * 10));
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) { return Lang.t('freshnessAgeMinutesLabel').replace('%s', String(minutes)); }

    const hours = Math.floor(minutes / 60);

    if (hours < 48) { return Lang.t('freshnessAgeHoursLabel').replace('%s', String(hours)); }

    return Lang.t('freshnessAgeDaysLabel').replace('%s', String(Math.floor(hours / 24)));
}

// Re-renders while the age label can still change: every 10 s during the first minute,
// then once a minute. Stops when there is no `fetchedAt`.
const useNow = fetchedAt => {
    const [ now, setNow ] = useState(() => Date.now());
    const millis = toMillis(fetchedAt);

    useEffect(() => {
        if (millis === null) { return undefined; }

        const age   = Date.now() - millis;
        const delay = age < 60 * 1000 ? 10 * 1000 : 60 * 1000;
        const timer = setTimeout(() => setNow(Date.now()), delay);

        return () => clearTimeout(timer);
    }, [ millis, now ]);

    return now;
};

/**
 * Tells the user where a departure time comes from and how fresh it is:
 * live board ("En vivo"), static schedule ("Horario") or offline cache ("Sin conexión · hace N min").
 *
 * @param {object} props
 * @param {'live'|'scheduled'|'offline'} props.source   One of `SOURCE` from includes/Schedule.
 * @param {number|Date|object} [props.fetchedAt]        When the data was fetched (ms, Date or dayjs).
 * @param {boolean} [props.compact]                     Icon + short text variant for watch / dense rows
 *                                                      (age when known, otherwise a short source label).
 * @param {object}  [props.style]
 * @param {boolean} [props.showAge=true]                Optional. Hide the relative age.
 */
export default function FreshnessChip({ source, fetchedAt, compact, style, showAge = true }) {
    const { theme } = useTheme();
    const now = useNow(showAge ? fetchedAt : null);

    const meta  = SOURCE_META[source] || SOURCE_META[SOURCE.SCHEDULED];
    const roles = theme.roles || {};
    const tones = {
        [SOURCE.LIVE]:      { backgroundColor: theme.successSurface, color: theme.success },
        [SOURCE.SCHEDULED]: {
            backgroundColor: roles.secondaryContainer   || theme.paperTheme?.colors?.surfaceVariant || theme.surfaceStrong,
            color:           roles.onSecondaryContainer || theme.paperTheme?.colors?.onSurfaceVariant || theme.textMuted
        },
        [SOURCE.OFFLINE]:   { backgroundColor: theme.offlineSurface, color: theme.offline }
    };
    const tone = tones[source] || tones[SOURCE.SCHEDULED];

    const age        = showAge ? formatFreshnessAge(fetchedAt, source, now) : null;
    const separator  = Lang.t('freshnessSeparator');
    const fullLabel  = age ? `${Lang.t(meta.label)}${separator}${age}` : Lang.t(meta.label);
    const visible    = compact ? (age || Lang.t(meta.shortLabel)) : fullLabel;
    const labelStyle = theme.type?.emphasized?.label || { fontWeight: '700' };

    return (
        <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={fullLabel}
            style={[
                styles.chip,
                compact ? styles.chipCompact : null,
                { backgroundColor: tone.backgroundColor, borderRadius: theme.shape?.full ?? 999 },
                style
            ]}
        >
            <Icon source={meta.icon} size={compact ? 14 : 16} color={tone.color} />
            <Text
                variant={compact ? 'labelSmall' : 'labelLarge'}
                numberOfLines={1}
                style={[ styles.label, labelStyle, { color: tone.color } ]}
            >
                {visible}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection:     'row',
        alignItems:        'center',
        alignSelf:         'center',
        gap:               6,
        minHeight:         32,
        paddingHorizontal: 12,
        paddingVertical:   4
    },
    chipCompact: {
        gap:               4,
        minHeight:         24,
        paddingHorizontal: 8,
        paddingVertical:   2
    },
    label: {
        flexShrink: 1
    }
});

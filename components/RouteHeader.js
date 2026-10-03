import React from 'react';

import { StyleSheet, View } from 'react-native';

import { IconButton, Text } from 'react-native-paper';

import Lang from '../includes/Lang';
import { useTheme } from '../includes/Theme';

/**
 * Origin → destination header shared by NextSchedule, FullSchedule and TripDetail.
 *
 * Regular: origin (labelLarge, muted) above destination (headlineSmall, emphasized), optional
 * subtitle, and trailing favorite toggle + tonal swap button. Compact (watch / short height):
 * one centered line "Origen → Destino" that shrinks to fit, with the actions (if any) in a small
 * centered row below so nothing touches the round bezel.
 *
 * @param {object}   props
 * @param {{id:number,title:string}} props.origin
 * @param {{id:number,title:string}} props.destination
 * @param {Function} [props.onSwap]            Shows the "invertir" action when set.
 * @param {boolean}  [props.isFavorite]
 * @param {Function} [props.onToggleFavorite]  Shows the favorite toggle when set.
 * @param {string}   [props.subtitle]          e.g. segment name ("Lunes a viernes").
 * @param {boolean}  [props.compact]           Watch / short-height variant.
 * @param {object}   [props.style]
 */
export default function RouteHeader({ origin, destination, onSwap, isFavorite, onToggleFavorite, subtitle, compact, style }) {
    const { theme } = useTheme();

    const roles       = theme.roles || {};
    const emphasized  = theme.type?.emphasized || {};
    const originTitle = origin?.title || '';
    const destTitle   = destination?.title || '';
    const routeLabel  = Lang.t('watchUiRouteA11yLabel').replace('%s', originTitle).replace('%s', destTitle);
    const hasActions  = Boolean(onToggleFavorite || onSwap);

    const favoriteButton = onToggleFavorite ? (
        <IconButton
            icon={isFavorite ? 'star' : 'star-outline'}
            iconColor={isFavorite ? (roles.primary || theme.accent) : theme.textMuted}
            size={compact ? 18 : 24}
            onPress={onToggleFavorite}
            accessibilityRole="button"
            accessibilityState={{ selected: Boolean(isFavorite) }}
            accessibilityLabel={Lang.t(isFavorite ? 'watchUiRemoveFavoriteA11yLabel' : 'watchUiAddFavoriteA11yLabel')}
            style={compact ? styles.compactAction : null}
        />
    ) : null;

    const swapButton = onSwap ? (
        <IconButton
            icon="swap-vertical"
            mode="contained-tonal"
            containerColor={roles.secondaryContainer}
            iconColor={roles.onSecondaryContainer}
            size={compact ? 18 : 22}
            onPress={onSwap}
            accessibilityRole="button"
            accessibilityLabel={Lang.t('watchUiSwapRouteA11yLabel')}
            style={compact ? styles.compactAction : null}
        />
    ) : null;

    if (compact) {
        return (
            <View style={[ styles.compactContainer, style ]}>
                <Text
                    variant="titleSmall"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    accessibilityRole="header"
                    accessibilityLabel={routeLabel}
                    style={styles.compactLine}
                >
                    <Text style={{ color: theme.textMuted }}>{originTitle}</Text>
                    <Text style={{ color: theme.textMuted }}>{'  →  '}</Text>
                    <Text style={[ emphasized.title, { color: theme.text } ]}>{destTitle}</Text>
                </Text>
                {subtitle ? (
                    <Text variant="labelSmall" numberOfLines={1} style={[ styles.compactSubtitle, { color: theme.textMuted } ]}>
                        {subtitle}
                    </Text>
                ) : null}
                {hasActions ? (
                    <View style={styles.compactActions}>
                        {favoriteButton}
                        {swapButton}
                    </View>
                ) : null}
            </View>
        );
    }

    return (
        <View style={[ styles.container, style ]}>
            <View
                style={styles.titles}
                accessible
                accessibilityRole="header"
                accessibilityLabel={subtitle ? `${routeLabel}. ${subtitle}` : routeLabel}
            >
                <Text variant="labelLarge" numberOfLines={1} style={{ color: theme.textMuted }}>
                    {originTitle}
                </Text>
                <View style={styles.destinationRow}>
                    <Text variant="titleMedium" style={[ styles.arrow, { color: roles.primary || theme.accent } ]}>→</Text>
                    <Text variant="headlineSmall" numberOfLines={2} style={[ styles.destination, emphasized.headline, { color: theme.text } ]}>
                        {destTitle}
                    </Text>
                </View>
                {subtitle ? (
                    <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.textMuted }}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {hasActions ? (
                <View style={styles.actions}>
                    {favoriteButton}
                    {swapButton}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           8
    },
    titles: {
        flex:     1,
        minWidth: 0,
        gap:      2
    },
    destinationRow: {
        flexDirection: 'row',
        alignItems:    'center',
        gap:           6
    },
    arrow: {
        fontWeight: '700'
    },
    destination: {
        flexShrink: 1
    },
    actions: {
        flexDirection: 'row',
        alignItems:    'center'
    },
    compactContainer: {
        alignItems:        'center',
        alignSelf:         'stretch',
        paddingHorizontal: 12
    },
    compactLine: {
        textAlign: 'center',
        maxWidth:  '100%'
    },
    compactSubtitle: {
        textAlign: 'center',
        marginTop: 2
    },
    compactActions: {
        flexDirection:  'row',
        justifyContent: 'center',
        alignItems:     'center',
        gap:            4,
        marginTop:      2
    },
    compactAction: {
        margin: 0
    }
});

import React from 'react';

import { View } from 'react-native';

import { IconButton, Text } from 'react-native-paper';

/**
 * Origin → destination header shared by NextSchedule, FullSchedule and TripDetail.
 * Contract (stub — owned by the shared components area):
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
export default function RouteHeader({ origin, destination, onSwap, isFavorite, onToggleFavorite, subtitle, style }) {
    return (
        <View style={[ { flexDirection: 'row', alignItems: 'center' }, style ]}>
            <View style={{ flex: 1 }}>
                <Text variant="titleMedium" numberOfLines={2}>{`${origin?.title || ''} → ${destination?.title || ''}`}</Text>
                {subtitle ? <Text variant="bodySmall">{subtitle}</Text> : null}
            </View>
            {onToggleFavorite ? <IconButton icon={isFavorite ? 'star' : 'star-outline'} onPress={onToggleFavorite} /> : null}
            {onSwap ? <IconButton icon="swap-vertical" onPress={onSwap} /> : null}
        </View>
    );
}

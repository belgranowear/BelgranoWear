import React, { useEffect, useRef } from 'react';

import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from 'react-native-paper';

import { useTheme } from '../../includes/Theme';

export const NAVIGATION_RAIL_WIDTH = 88;

const useNativeDriver = Platform.OS !== 'web';

function RailItem({ item, active, onPress }) {
    const { theme } = useTheme();
    const indicatorScale = useRef(new Animated.Value(active ? 1 : 0)).current;

    useEffect(() => {
        Animated.spring(indicatorScale, {
            toValue: active ? 1 : 0,
            ...(theme.motion?.spring?.fastSpatial || {}),
            useNativeDriver
        }).start();
    }, [ active ]);

    const iconColor = active ? theme.roles.onSecondaryContainer : theme.textMuted;

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            style={styles.item}
        >
            {({ hovered, pressed }) => (
                <>
                    <View style={[ styles.indicatorSlot, { borderRadius: theme.shape.full } ]}>
                        {!active && (hovered || pressed) ? (
                            <View
                                style={[
                                    StyleSheet.absoluteFill,
                                    { borderRadius: theme.shape.full, backgroundColor: theme.roles.surfaceContainerHigh }
                                ]}
                            />
                        ) : null}
                        <Animated.View
                            style={[
                                StyleSheet.absoluteFill,
                                {
                                    borderRadius: theme.shape.full,
                                    backgroundColor: theme.roles.secondaryContainer,
                                    opacity: indicatorScale,
                                    transform: [ { scaleX: indicatorScale } ]
                                }
                            ]}
                        />
                        <Icon source={active ? (item.activeIcon || item.icon) : item.icon} size={24} color={iconColor} />
                    </View>
                    <Text
                        variant="labelMedium"
                        numberOfLines={1}
                        style={[
                            styles.label,
                            { color: active ? theme.text : theme.textMuted },
                            active ? theme.type.emphasized.label : undefined
                        ]}
                    >
                        {item.label}
                    </Text>
                </>
            )}
        </Pressable>
    );
}

/**
 * Material 3 navigation rail for expanded layouts (tablet landscape / desktop).
 *
 * @param {object}   props
 * @param {Array<{key: string, label: string, icon: string, activeIcon?: string}>} props.items
 *        Destinations; `icon`/`activeIcon` are MaterialCommunityIcons names.
 * @param {string}   props.activeKey     Key of the selected destination.
 * @param {Function} props.onSelect      Called with the destination key.
 * @param {React.ReactNode} [props.header]  Optional node above the destinations (e.g. a FAB).
 * @param {string}   [props.accessibilityLabel]
 */
export default function NavigationRail({ items, activeKey, onSelect, header, accessibilityLabel, style }) {
    const { theme } = useTheme();

    return (
        <View
            accessibilityRole="tablist"
            accessibilityLabel={accessibilityLabel}
            style={[ styles.rail, { backgroundColor: theme.roles.surfaceContainerLow }, style ]}
        >
            {header || null}
            <View style={styles.items}>
                {items.map(item => (
                    <RailItem
                        key={item.key}
                        item={item}
                        active={item.key === activeKey}
                        onPress={() => onSelect(item.key)}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    rail: {
        width: NAVIGATION_RAIL_WIDTH,
        alignItems: 'center',
        paddingTop: 24,
        paddingBottom: 16
    },
    items: {
        width: '100%',
        alignItems: 'center',
        gap: 12
    },
    item: {
        width: '100%',
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 4
    },
    indicatorSlot: {
        width: 56,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
    },
    label: {
        textAlign: 'center'
    }
});

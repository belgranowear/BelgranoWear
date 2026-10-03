import React, { useState } from 'react';

import { IconButton } from 'react-native-paper';

import LazyMenu from './LazyMenu';

import { useTheme } from '../../includes/Theme';

/**
 * Top app bar overflow ("⋮") menu used on compact layouts, where the navigation rail is hidden.
 *
 * @param {object}   props
 * @param {Array<{key: string, label: string, icon?: string, onPress: Function}>} props.items
 * @param {string}   [props.accessibilityLabel]
 */
export default function HeaderOverflowMenu({ items, accessibilityLabel }) {
    const { theme } = useTheme();
    const [ visible, setVisible ] = useState(false);

    return (
        <LazyMenu
            visible={visible}
            onDismiss={() => setVisible(false)}
            anchorPosition="bottom"
            contentStyle={{ backgroundColor: theme.roles.surfaceContainer, borderRadius: theme.shape.lg }}
            anchor={(
                <IconButton
                    icon="dots-vertical"
                    mode="contained-tonal"
                    size={22}
                    accessibilityLabel={accessibilityLabel}
                    containerColor={theme.roles.surfaceContainerHigh}
                    iconColor={theme.text}
                    onPress={() => setVisible(true)}
                />
            )}
        >
            {items.map(item => (
                <LazyMenu.Item
                    key={item.key}
                    leadingIcon={item.icon}
                    title={item.label}
                    onPress={() => {
                        setVisible(false);
                        item.onPress();
                    }}
                />
            ))}
        </LazyMenu>
    );
}

import React from 'react';

import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text } from 'react-native-paper';

import { isRoundScreen } from '../../includes/Device';
import { useTheme } from '../../includes/Theme';
import { clamp, useResponsiveMetrics } from '../ui';

/**
 * Full-screen confirmation for watches, after the Wear OS Material 3 AlertDialog: optional
 * icon, centred title and message, and round dismiss/confirm buttons side by side. Paper's
 * Dialog is sized for phones; on a round face its headline wraps mid-word and the actions
 * end up outside the circle.
 *
 * @param {object}   props
 * @param {boolean}  props.visible
 * @param {string}   props.title
 * @param {string}   [props.message]
 * @param {string}   [props.icon]                 MaterialCommunityIcons name above the title.
 * @param {Function} props.onConfirm
 * @param {Function} props.onDismiss              Cancel button, back gesture.
 * @param {string}   props.confirmLabel           Accessibility label of the confirm button.
 * @param {string}   props.dismissLabel           Accessibility label of the dismiss button.
 * @param {boolean}  [props.destructive=false]    Confirm button in the error colour.
 */
export default function WatchConfirm({
    visible,
    title,
    message,
    icon,
    onConfirm,
    onDismiss,
    confirmLabel,
    dismissLabel,
    destructive = false
}) {
    const { theme }  = useTheme();
    const responsive = useResponsiveMetrics();
    const side       = responsive.shortestSide;
    const round      = isRoundScreen({ width: responsive.width, height: responsive.height, watch: true });
    const button     = clamp(Math.round(side * 0.22), 40, 52);
    const colors     = theme.paperTheme?.colors || {};
    const confirmBg  = destructive ? (colors.error || theme.danger) : theme.roles.primary;
    const confirmFg  = destructive ? (colors.onError || '#fff') : theme.roles.onPrimary;

    return (
        <Modal visible={Boolean(visible)} onRequestClose={onDismiss} animationType="fade" transparent={false} statusBarTranslucent>
            <View style={[ styles.root, { backgroundColor: theme.background } ]}>
                <ScrollView
                    contentContainerStyle={[
                        styles.content,
                        {
                            minHeight:         responsive.height,
                            // The circle is widest in the middle: keep text inside the inscribed square on round faces.
                            paddingHorizontal: Math.round(side * (round ? 0.12 : 0.06)),
                            paddingTop:        Math.round(side * (round ? 0.1 : 0.05)),
                            paddingBottom:     Math.round(side * (round ? 0.1 : 0.05))
                        }
                    ]}
                    showsVerticalScrollIndicator={false}
                >
                    {icon ? <Icon source={icon} size={24} color={destructive ? confirmBg : theme.accent} /> : null}
                    <Text style={[ styles.title, theme.type?.emphasized?.title, { color: theme.text } ]} accessibilityRole="header">
                        {title}
                    </Text>
                    {message ? (
                        <Text style={[ styles.message, { color: theme.textMuted } ]}>{message}</Text>
                    ) : null}
                    <View style={styles.actions}>
                        <Pressable
                            onPress={onDismiss}
                            accessibilityRole="button"
                            accessibilityLabel={dismissLabel}
                            style={({ pressed }) => [
                                styles.button,
                                { width: button, height: button, borderRadius: button / 2, backgroundColor: theme.roles.surfaceContainerHigh || theme.surface, opacity: pressed ? 0.75 : 1 }
                            ]}
                        >
                            <Icon source="close" size={Math.round(button * 0.45)} color={theme.text} />
                        </Pressable>
                        <Pressable
                            onPress={onConfirm}
                            accessibilityRole="button"
                            accessibilityLabel={confirmLabel}
                            style={({ pressed }) => [
                                styles.button,
                                { width: button, height: button, borderRadius: button / 2, backgroundColor: confirmBg, opacity: pressed ? 0.75 : 1 }
                            ]}
                        >
                            <Icon source={destructive ? 'delete-outline' : 'check'} size={Math.round(button * 0.45)} color={confirmFg} />
                        </Pressable>
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1
    },
    content: {
        flexGrow:       1,
        alignItems:     'center',
        justifyContent: 'center',
        gap:            6
    },
    title: {
        fontSize:   15,
        lineHeight: 19,
        fontWeight: '700',
        textAlign:  'center'
    },
    message: {
        fontSize:   12,
        lineHeight: 16,
        textAlign:  'center'
    },
    actions: {
        flexDirection:  'row',
        justifyContent: 'center',
        gap:            12,
        marginTop:      4
    },
    button: {
        alignItems:     'center',
        justifyContent: 'center'
    }
});

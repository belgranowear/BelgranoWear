import React, { useRef } from 'react';

import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Button, Icon, Text } from 'react-native-paper';
import Svg, { Path } from 'react-native-svg';

import EdgeFade from './EdgeFade';

import { isRoundScreen, isWatchDevice } from '../../includes/Device';
import { useTheme } from '../../includes/Theme';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const SQUARE_SIDE_MARGIN   = 8;
const SQUARE_BOTTOM_MARGIN = 6;
/**
 * Geometry shared by EdgeButton and by screens that need to reserve room for it.
 *
 * @param {number} width   Window width (dp).
 * @param {number} height  Window height (dp).
 * @returns {{ isWatch:boolean, isRound:boolean, height:number, reservedSpace:number, path:?string, contentHeight:number }}
 *          `reservedSpace` is the bottom padding a scrollable behind the button needs so its
 *          last row can scroll above the button (0 on phones, where the button is inline).
 */
export function getEdgeButtonGeometry(width, height) {
    const watch = isWatchDevice({ width, height });
    const round = watch && isRoundScreen({ width, height, watch });
    const shortestSide = Math.min(width, height);

    if (!watch) {
        return { isWatch: false, isRound: false, height: 0, reservedSpace: 0, path: null, contentHeight: 0 };
    }

    if (!round) {
        const pillHeight = clamp(shortestSide * 0.22, 46, 56);

        return {
            isWatch:       true,
            isRound:       false,
            height:        pillHeight,
            reservedSpace: pillHeight + SQUARE_BOTTOM_MARGIN + 8,
            path:          null,
            contentHeight: pillHeight
        };
    }

    // Round: a bottom cap whose lower edge follows the bezel (inset by `gap`) and whose top
    // edge is a straight line with rounded corners, like Wear OS Material 3 EdgeButton.
    const capHeight = clamp(shortestSide * 0.24, 46, 64);
    const radius    = shortestSide / 2;
    const gap       = clamp(shortestSide * 0.015, 2, 4);
    const r         = radius - gap;
    const cx        = width / 2;
    const cy        = capHeight - (height / 2);          // screen centre in the cap's local coordinates
    const fullHalf  = Math.sqrt(Math.max(0, (r * r) - (cy * cy)));
    const halfTop   = Math.min(fullHalf - 1, width * 0.34);
    const sideY     = cy + Math.sqrt(Math.max(0, (r * r) - (halfTop * halfTop)));
    // Corner radius: as round as the short straight side allows (the bezel arc starts at sideY).
    const corner    = clamp(Math.min(capHeight * 0.4, sideY - 2), 6, Math.max(6, halfTop - 4));
    const f         = value => Math.round(value * 100) / 100;

    let path;

    if (sideY >= corner + 2) {
        // Straight short sides drop from the rounded top corners down to the bezel arc.
        path = [
            `M ${f(cx - halfTop + corner)} 0`,
            `L ${f(cx + halfTop - corner)} 0`,
            `Q ${f(cx + halfTop)} 0 ${f(cx + halfTop)} ${f(corner)}`,
            `L ${f(cx + halfTop)} ${f(sideY)}`,
            `A ${f(r)} ${f(r)} 0 0 1 ${f(cx - halfTop)} ${f(sideY)}`,
            `L ${f(cx - halfTop)} ${f(corner)}`,
            `Q ${f(cx - halfTop)} 0 ${f(cx - halfTop + corner)} 0`,
            'Z'
        ].join(' ');
    } else {
        // Top corners land directly on the bezel arc.
        const cornerY = Math.min(corner, capHeight * 0.5);
        const arcX    = Math.sqrt(Math.max(0, (r * r) - ((cornerY - cy) * (cornerY - cy))));

        path = [
            `M ${f(cx - fullHalf + corner)} 0`,
            `L ${f(cx + fullHalf - corner)} 0`,
            `Q ${f(cx + fullHalf)} 0 ${f(cx + arcX)} ${f(cornerY)}`,
            `A ${f(r)} ${f(r)} 0 0 1 ${f(cx - arcX)} ${f(cornerY)}`,
            `Q ${f(cx - fullHalf)} 0 ${f(cx - fullHalf + corner)} 0`,
            'Z'
        ].join(' ');
    }

    return {
        isWatch:       true,
        isRound:       true,
        height:        capHeight,
        reservedSpace: capHeight + 8,
        path,
        // The cap narrows towards the bottom: keep the label in its upper ~85 %.
        contentHeight: capHeight * 0.85
    };
}

/** Hook version of `getEdgeButtonGeometry` bound to the current window size. */
export function useEdgeButtonMetrics() {
    const { width, height } = useWindowDimensions();

    return getEdgeButtonGeometry(width, height);
}

/**
 * Wear OS "edge-hugging" primary action pinned to the bottom of the screen.
 * On round displays it is drawn as a bottom cap that follows the bezel; on
 * square displays it falls back to a full-width pill. On phones/tablets it renders an
 * inline Paper contained Button.
 *
 * On watches the button is absolutely positioned at the bottom (`placement="absolute"`), so
 * render it as a direct child of a full-screen container, next to the scrollable, and pad
 * the scroll content with `useEdgeButtonMetrics().reservedSpace`.
 *
 * @param {object}   props
 * @param {string}   props.label               Visible text (keep it short: 1–2 words).
 * @param {string}   [props.icon]              MaterialCommunityIcons name shown before the label.
 * @param {Function} props.onPress
 * @param {boolean}  [props.disabled]
 * @param {string}   [props.accessibilityLabel]
 * @param {object}   [props.style]
 * @param {'container'|'filled'} [props.variant='container']  Optional. `container` uses
 *                                             primaryContainer/onPrimaryContainer, `filled` uses primary/onPrimary.
 * @param {'absolute'|'inline'} [props.placement='absolute']  Optional, watch only. `inline`
 *                                             keeps it in the layout flow (geometry still assumes
 *                                             it sits at the bottom of the screen).
 * @param {string}   [props.accessibilityHint] Optional.
 */
export default function EdgeButton({
    label,
    icon,
    onPress,
    disabled,
    accessibilityLabel,
    accessibilityHint,
    style,
    variant   = 'container',
    placement = 'absolute'
}) {
    const { theme } = useTheme();
    const { width, height } = useWindowDimensions();
    const scale = useRef(new Animated.Value(1)).current;

    const geometry = getEdgeButtonGeometry(width, height);
    const roles    = theme.roles || {};
    const filled   = variant === 'filled';

    const containerColor = disabled
        ? theme.text
        : (filled ? (roles.primary || theme.accent) : (roles.primaryContainer || theme.accentSoft));
    const contentColor = disabled
        ? theme.text
        : (filled ? (roles.onPrimary || theme.textInverse) : (roles.onPrimaryContainer || theme.text));

    if (!geometry.isWatch) {
        return (
            <Button
                mode="contained"
                icon={icon}
                onPress={onPress}
                disabled={disabled}
                buttonColor={disabled ? undefined : containerColor}
                textColor={disabled ? undefined : contentColor}
                accessibilityLabel={accessibilityLabel || label}
                accessibilityHint={accessibilityHint}
                style={style}
            >
                {label}
            </Button>
        );
    }

    const spring = theme.motion?.spring?.fastSpatial || { damping: 18, stiffness: 1400, mass: 1 };
    const animateTo = toValue => Animated.spring(scale, { toValue, useNativeDriver: true, ...spring }).start();

    const labelStyle = theme.type?.emphasized?.label || { fontWeight: '700' };
    const content = (
        <View style={[ styles.content, { height: geometry.contentHeight } ]} pointerEvents="none">
            {icon ? <Icon source={icon} size={20} color={contentColor} /> : null}
            <Text
                variant="labelLarge"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[ styles.label, labelStyle, { color: contentColor } ]}
            >
                {label}
            </Text>
        </View>
    );

    const positionStyle = placement === 'absolute'
        ? (geometry.isRound ? styles.absoluteRound : styles.absoluteSquare)
        : null;

    const button = (
        <Animated.View
            style={[
                geometry.isRound
                    ? { width, height: geometry.height, alignSelf: 'center' }
                    : [ placement === 'absolute' ? null : styles.square, { height: geometry.height } ],
                positionStyle,
                { opacity: disabled ? 0.38 : 1, transform: [ { scale } ] },
                style
            ]}
        >
            <Pressable
                onPress={onPress}
                disabled={disabled}
                onPressIn={() => animateTo(0.96)}
                onPressOut={() => animateTo(1)}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel || label}
                accessibilityHint={accessibilityHint}
                accessibilityState={{ disabled: Boolean(disabled) }}
                style={StyleSheet.absoluteFill}
            >
                {({ pressed }) => geometry.isRound ? (
                    <View style={StyleSheet.absoluteFill}>
                        <Svg width={width} height={geometry.height} style={StyleSheet.absoluteFill}>
                            <Path d={geometry.path} fill={containerColor} fillOpacity={disabled ? 0.12 : 1} />
                            {pressed ? <Path d={geometry.path} fill={contentColor} fillOpacity={0.12} /> : null}
                        </Svg>
                        {content}
                    </View>
                ) : (
                    <View style={[ styles.squareFill, { borderRadius: theme.shape?.full ?? 999 } ]}>
                        <View style={[ StyleSheet.absoluteFill, { backgroundColor: containerColor, opacity: disabled ? 0.12 : 1 } ]} />
                        {pressed ? <View style={[ StyleSheet.absoluteFill, { backgroundColor: contentColor, opacity: 0.12 } ]} /> : null}
                        {content}
                    </View>
                )}
            </Pressable>
        </Animated.View>
    );

    if (placement !== 'absolute') { return button; }

    const scrimHeight = geometry.isRound ? geometry.height : geometry.height + SQUARE_BOTTOM_MARGIN;

    return (
        <>
            {/* Content scrolling towards the button dissolves instead of showing around the cap. */}
            <EdgeFade edge="bottom" solid={scrimHeight} color={theme.background} />
            {button}
        </>
    );
}

const styles = StyleSheet.create({
    absoluteRound: {
        position: 'absolute',
        bottom:   0
    },
    absoluteSquare: {
        position: 'absolute',
        bottom:   SQUARE_BOTTOM_MARGIN,
        left:     SQUARE_SIDE_MARGIN,
        right:    SQUARE_SIDE_MARGIN
    },
    square: {
        alignSelf:        'stretch',
        marginHorizontal: SQUARE_SIDE_MARGIN,
        marginBottom:     SQUARE_BOTTOM_MARGIN
    },
    squareFill: {
        flex:           1,
        overflow:       'hidden',
        justifyContent: 'center'
    },
    content: {
        flexDirection:     'row',
        alignItems:        'center',
        justifyContent:    'center',
        gap:               6,
        paddingHorizontal: 20
    },
    label: {
        flexShrink: 1
    }
});

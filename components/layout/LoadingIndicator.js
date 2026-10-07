import React, { useEffect, useState } from 'react';

import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../../includes/Theme';

// M3 Expressive LoadingIndicator: a shape that morphs through a sequence of rounded polygons
// while it rotates. Shapes are star-convex polar curves r(θ) = 1 + a·cos(nθ + φ) (plus an
// oval), so any two of them interpolate per angle without self-intersecting.
const SAMPLES     = 96;
const STEP_MS     = 650;
const STEP_TURN   = 140;   // extra degrees gained on every morph, on top of the constant spin
const SPIN_PER_MS = 0.05;  // ≈ 18°/s background rotation

const lobes = (n, amplitude, phase = 0) => theta => 1 + amplitude * Math.cos(n * theta + phase);
const oval  = theta => 1 / Math.sqrt(Math.cos(theta) ** 2 + (Math.sin(theta) / 0.78) ** 2);

// SoftBurst → Cookie9 → Pentagon → Pill → Sunny → Cookie4 → Oval (Compose LoadingIndicator order).
const SHAPES = [
    lobes(10, 0.11),
    lobes(9,  0.08),
    lobes(5,  0.10, Math.PI),
    theta => oval(theta) * 0.92 + 0.08 * Math.cos(2 * theta),
    lobes(8,  0.07),
    lobes(4,  0.12),
    oval
];

// Normalized so every shape has the same maximum radius (the indicator never "breathes" out of bounds).
const RADII = SHAPES.map(shape => {
    const radii = [];
    for (let i = 0; i < SAMPLES; i++) { radii.push(shape((i / SAMPLES) * Math.PI * 2)); }
    const max = Math.max(...radii);
    return radii.map(r => r / max);
});

// Spatial spring feel without a physics step: ease-out with a small overshoot.
const easeOutBack = t => {
    const c = 1.2;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

const buildPath = (from, to, t, rotationDeg, size) => {
    const center = size / 2;
    const rotation = (rotationDeg * Math.PI) / 180;
    let d = '';

    for (let i = 0; i < SAMPLES; i++) {
        const theta = (i / SAMPLES) * Math.PI * 2;
        const r = (from[i] + (to[i] - from[i]) * t) * center;
        const x = center + r * Math.cos(theta + rotation);
        const y = center + r * Math.sin(theta + rotation);
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }

    return `${d}Z`;
};

function useReduceMotion() {
    const [ reduceMotion, setReduceMotion ] = useState(false);

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled?.().then(value => { if (mounted) { setReduceMotion(Boolean(value)); } }).catch(() => {});
        const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => setReduceMotion(Boolean(value)));
        return () => { mounted = false; subscription?.remove?.(); };
    }, []);

    return reduceMotion;
}

/**
 * Material 3 Expressive loading indicator (morphing shape), for waits of a few seconds.
 *
 * @param {object}  props
 * @param {number}  [props.size=48]        outer size in dp (container size when `contained`).
 * @param {boolean} [props.contained=true] draws the shape on a primaryContainer circle.
 * @param {string}  [props.color]          shape color; defaults to the M3 role for the variant.
 * @param {string}  [props.accessibilityLabel]
 */
export default function LoadingIndicator({ size = 48, contained = true, color, accessibilityLabel, style }) {
    const { theme } = useTheme();
    const reduceMotion = useReduceMotion();
    const [ now, setNow ] = useState(0);

    useEffect(() => {
        let frame;
        const start = Date.now();
        const tick = () => {
            setNow(Date.now() - start);
            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, []);

    // M3 spec: 38dp active indicator inside a 48dp container.
    const shapeSize = contained ? Math.round(size * 0.79) : size;
    const step      = Math.floor(now / STEP_MS);
    const local     = reduceMotion ? 0 : easeOutBack(Math.min(1, (now % STEP_MS) / (STEP_MS * 0.75)));
    const from      = RADII[step % RADII.length];
    const to        = RADII[(step + 1) % RADII.length];
    const rotation  = reduceMotion ? now * SPIN_PER_MS : now * SPIN_PER_MS + (step + local) * STEP_TURN;
    const fill      = color || (contained ? theme.roles.onPrimaryContainer : theme.roles.primary);

    return (
        <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ busy: true }}
            style={[
                styles.root,
                { width: size, height: size, borderRadius: size / 2 },
                contained ? { backgroundColor: theme.roles.primaryContainer } : undefined,
                style
            ]}
        >
            <Svg width={shapeSize} height={shapeSize} viewBox={`0 0 ${shapeSize} ${shapeSize}`}>
                <Path d={buildPath(from, to, local, rotation, shapeSize)} fill={fill} />
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    // Centred by default: in a stretching column (e.g. a card's content) a fixed-size view hugs the start edge.
    root: {
        alignSelf:      'center',
        alignItems:     'center',
        justifyContent: 'center'
    }
});

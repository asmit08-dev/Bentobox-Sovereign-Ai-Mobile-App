import {
  Canvas,
  Circle,
  Fill,
  RadialGradient,
  Shader,
  Skia,
  vec,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { View } from 'react-native';
import {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useAppActive } from '@/hooks/useAppActive';
import { useLoopClock } from '@/hooks/useLoopClock';
import { colors } from '@/theme/tokens';

/**
 * idle: breathes slowly. thinking: the petals turn fast and the light pulses.
 * streaming: a gentle pulse. listening: opens with the user's voice (`level`). speaking: like streaming.
 */
export type OrbMode = 'idle' | 'thinking' | 'streaming' | 'listening' | 'speaking';

// How fast the petals turn in each mode (1 = idle).
const SPEED: Record<OrbMode, number> = {
  idle: 1,
  thinking: 4.5,
  streaming: 2,
  listening: 1.6,
  speaking: 2.2,
};

// How restless the petals are: 0 calm … 1 busy.
const ENERGY: Record<OrbMode, number> = {
  idle: 0,
  thinking: 1,
  streaming: 0.45,
  listening: 0.3,
  speaking: 0.55,
};

// Extra light around the orb while it works. It fades in and out, never static.
const GLOW: Record<OrbMode, number> = {
  idle: 0,
  thinking: 1,
  streaming: 0.5,
  listening: 0.6,
  speaking: 0.5,
};

// The still orb is drawn at this moment of the loop (a pleasing arrangement of the petals).
const STILL_SECONDS = 7.4;
// The drawing needs room around the sphere for the light that spills from it.
// 2 radii is enough for the aura (it is under 1% beyond that) and keeps the big orbs cheap.
const PLAIN_REACH = 1.5;
const AURA_REACH = 2;

/** '#6E22DD' → [0.43, 0.13, 0.87] for the shader. */
function rgb(hex: string) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
}

const PALETTE = {
  uViolet: rgb(colors.accent),
  uPurple: rgb(colors.orbPurple),
  uMagenta: rgb(colors.orbMagenta),
  uBlush: rgb(colors.orbBlush),
  uPale: rgb(colors.orbPale),
};

const PETALS = 5;

// The orb is painted by a small GPU program (SkSL). Five see-through glass petals turn inside
// a sphere. Each petal is a big disc that sits off-center, so its edge crosses the sphere and
// draws a crescent where it overlaps the others. All of them take their color from one ramp
// that runs from pale pink (lower left) to deep violet (upper right).
//
// Two things keep it cheap and safe on every phone:
// - Where each petal sits is worked out once per frame in `petalUniforms` below, not for
//   every pixel. The program itself has no sin or cos.
// - Colors come in as uniforms, so tokens.ts stays the only place that names them.
// (`smoothstep` is always called with the low edge first: the other order is undefined in GLSL.)
const ORB_SKSL = `
uniform float2 uCenter;
uniform float uRadius;
uniform float uReach;
uniform float uAura;
uniform float4 uA0;
uniform float4 uA1;
uniform float4 uA2;
uniform float4 uA3;
uniform float4 uA4;
uniform float4 uB0;
uniform float4 uB1;
uniform float4 uB2;
uniform float4 uB3;
uniform float4 uB4;
uniform float3 uViolet;
uniform float3 uPurple;
uniform float3 uMagenta;
uniform float3 uBlush;
uniform float3 uPale;

float3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  float3 c = mix(uPale, uBlush, smoothstep(0.0, 0.16, t));
  c = mix(c, uMagenta, smoothstep(0.12, 0.46, t));
  c = mix(c, uPurple, smoothstep(0.4, 0.68, t));
  c = mix(c, uViolet, smoothstep(0.62, 0.92, t));
  return c;
}

// a = (center x, center y, 1 / long radius, 1 / short radius)
// b = (cos of its turn, sin of its turn, its home on the ramp, short radius)
float3 petal(float3 col, float2 p, float light, float4 a, float4 b) {
  float2 d = p - a.xy;
  float2 q = float2(b.x * d.x + b.y * d.y, b.x * d.y - b.y * d.x) * a.zw;
  float dist = length(q) - 1.0;
  float inside = 1.0 - smoothstep(-0.7, 0.7, dist * b.w * uRadius);
  // Each petal has its own place on the ramp, pulled toward the light around it.
  float3 tint = ramp(mix(light, b.z, 0.5));
  // Glass: a petal is a little brighter near its rim.
  tint = mix(tint, float3(1.0), 0.14 * smoothstep(-0.3, 0.0, dist));
  return mix(col, tint, inside * 0.42);
}

half4 main(float2 xy) {
  // The sphere is the unit circle.
  float2 p = (xy - uCenter) / uRadius;
  float r = length(p);
  float sphere = 1.0 - smoothstep(-0.7, 0.7, (r - 1.0) * uRadius);
  // 0 at the lower left (pale), 1 at the upper right (violet).
  float light = dot(p, float2(0.6, -0.8)) * 0.5 + 0.5;

  float3 col = float3(0.0);
  if (sphere > 0.0) {
    col = ramp(light * 0.86 + 0.12);
    col = petal(col, p, light, uA0, uB0);
    col = petal(col, p, light, uA1, uB1);
    col = petal(col, p, light, uA2, uB2);
    col = petal(col, p, light, uA3, uB3);
    col = petal(col, p, light, uA4, uB4);
    // A soft light inside the lower left, and a thin bright rim there: the sphere looks lit.
    float glowIn = 1.0 - smoothstep(0.0, 0.9, length(p - float2(-0.34, 0.4)));
    col = mix(col, float3(1.0), 0.16 * glowIn);
    float rimLight = smoothstep(0.72, 1.0, r) * (1.0 - smoothstep(0.1, 0.75, light));
    col = mix(col, float3(1.0), 0.3 * rimLight);
  }

  // The aura: light that spills from the orb onto the canvas, a touch lower than the sphere.
  // It fades to nothing before the edge of the drawing.
  float aura = 0.0;
  float3 spillTint = float3(0.0);
  if (uAura > 0.0 && sphere < 1.0) {
    float away = length(p - float2(0.0, 0.1));
    float spill = exp(-2.4 * max(away - 0.72, 0.0)) * (1.0 - smoothstep(uReach * 0.7, uReach, away));
    spillTint = mix(ramp(light * 0.8 + 0.14), uPale, 0.25);
    aura = 0.5 * uAura * spill * (1.0 - sphere);
  }

  return half4(half3(col * sphere + spillTint * aura), half(sphere + aura));
}
`;

type OrbUniforms = Record<string, number | number[]>;

/**
 * Where the five petals are at `seconds`. Runs on the UI thread once per frame.
 * `busy` (0–1) makes them restless; `voice` (0–1) opens them up.
 */
function petalUniforms(target: OrbUniforms, seconds: number, busy: number, voice: number) {
  'worklet';
  for (let index = 0; index < PETALS; index++) {
    const seat = index * 1.2566 + 0.4;
    const direction = index % 2 === 0 ? 1 : -1;
    const spin = seconds * (0.16 + 0.04 * index) * direction;
    const spread = 0.42 + 0.06 * Math.sin(seconds * 0.45 + seat * 1.3) + 0.1 * voice + 0.05 * busy;
    const long = 0.88 + 0.05 * Math.sin(seconds * 0.38 + seat * 2);
    // A petal that leans away from us looks narrower.
    const lean = 0.84 + (0.1 + 0.05 * busy) * Math.sin(seconds * 0.6 + seat * 1.7);
    const short = long * lean;
    const turn = seat * 0.8 + spin * 0.7;
    const home = (0.93 + index * 0.37) % 1;
    target[`uA${index}`] = [
      spread * Math.cos(seat + spin),
      spread * Math.sin(seat + spin),
      1 / long,
      1 / short,
    ];
    target[`uB${index}`] = [Math.cos(turn), Math.sin(turn), home, short];
  }
}

// Compiled on first use, not at import time: the browser preview loads Skia a moment
// after this file. `false` means it was tried and failed (then the simple orb is drawn).
let compiled: SkRuntimeEffect | false | undefined;

function orbEffect() {
  if (compiled === undefined) {
    try {
      compiled = Skia.RuntimeEffect.Make(ORB_SKSL) ?? false;
    } catch {
      compiled = false;
    }
  }
  return compiled || null;
}

const SIMPLE_COLORS = [
  colors.accent,
  colors.orbPurple,
  colors.orbMagenta,
  colors.orbBlush,
  colors.orbPale,
];
const SIMPLE_STOPS = [0, 0.3, 0.56, 0.8, 1];

type OrbProps = {
  size: number;
  /** Only one orb moves at a time. Pass false for every other orb. */
  animated?: boolean;
  mode?: OrbMode;
  /** Voice loudness, 0–1. Used in "listening" mode. */
  level?: SharedValue<number>;
  /** Light spilling onto the canvas around the orb, 0–1. For the big hero orbs. */
  aura?: number;
};

/**
 * The assistant's face: a glowing violet-to-pink sphere made of see-through glass petals.
 * Idle: it breathes (3s) and its petals turn slowly. Busy modes turn faster and glow.
 * It stays still with Reduce Motion (only the glow fades) and while the app is in the background.
 * A still orb is drawn once and then costs nothing.
 */
export function Orb({ size, animated = true, mode = 'idle', level, aura = 0 }: OrbProps) {
  const reduceMotion = useReducedMotion();
  const appActive = useAppActive();
  const moving = animated && appActive && !reduceMotion;
  const speed = useSharedValue(SPEED[mode]);
  const energy = useSharedValue(0);
  const glow = useSharedValue(0);
  const time = useLoopClock(moving, speed);
  const beat = useLoopClock(moving);

  useEffect(() => {
    // Ease between modes over 600ms, so the orb settles back to idle softly.
    speed.set(withTiming(SPEED[mode], { duration: 600 }));
    energy.set(withTiming(animated ? ENERGY[mode] : 0, { duration: 600 }));
    const target = animated ? GLOW[mode] : 0;
    cancelAnimation(glow);
    if (target === 0) {
      glow.set(withTiming(0, { duration: 600 }));
    } else {
      // The glow is light, not movement, so it also runs with Reduce Motion: there it is
      // the only sign that the orb is working.
      glow.set(
        withRepeat(
          withSequence(
            withTiming(target, { duration: 900, easing: Easing.inOut(Easing.quad) }),
            withTiming(target * 0.45, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
          true,
          undefined,
          ReduceMotion.Never,
        ),
      );
    }
  }, [animated, energy, glow, mode, speed]);

  const reach = aura > 0 ? AURA_REACH : PLAIN_REACH;
  const box = Math.ceil(size * reach);
  // The canvas is bigger than the orb's own box and centered on it.
  const inset = (size - box) / 2;
  const radius = size / 2;
  const listening = mode === 'listening';

  const uniforms = useDerivedValue(() => {
    // A still orb (Reduce Motion, background) does not follow the voice either.
    const voice = moving && listening && level ? level.get() : 0;
    // The sphere breathes from 1 to 1.035 and back (3s), and opens with the voice.
    const breath = 1 + 0.0175 * (1 - Math.cos((beat.get() / 1000) * 2.094)) + 0.1 * voice;
    const scaled = radius * breath;
    const values: OrbUniforms = {
      uCenter: [box / 2, box / 2],
      uRadius: scaled,
      // How far the light may reach, in sphere radii: exactly to the edge of the drawing.
      uReach: box / 2 / scaled,
      // A hero keeps its own aura and the working glow adds to it. A small orb has only the glow.
      uAura: aura > 0 ? aura + 0.35 * glow.get() : 0.9 * glow.get(),
      ...PALETTE,
    };
    petalUniforms(values, STILL_SECONDS + time.get() / 1000, energy.get(), voice);
    return values;
  });

  const effect = orbEffect();

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      {/* One plain style object: the browser preview's canvas does not accept a style list.
          sRGB, because the program gets its colors as plain numbers: on a wide-color iPhone
          screen they would otherwise come out more saturated than the tokens. */}
      <Canvas
        colorSpace="srgb"
        style={{ position: 'absolute', top: inset, left: inset, width: box, height: box }}
      >
        {effect ? (
          <Fill dither>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        ) : (
          // The GPU program did not compile on this phone: draw a plain lit sphere instead.
          <Circle cx={box / 2} cy={box / 2} r={radius}>
            <RadialGradient
              c={vec(box / 2 + size * 0.26, box / 2 - size * 0.36)}
              r={size * 1.05}
              colors={SIMPLE_COLORS}
              positions={SIMPLE_STOPS}
            />
          </Circle>
        )}
      </Canvas>
    </View>
  );
}

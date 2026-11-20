import { Canvas, Fill, Shader, Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useAppActive } from '@/hooks/useAppActive';
import { withAlpha } from '@/lib/color';
import { useTheme } from '@/theme/theme';

/**
 * off: sunk below the edge. idle: waiting, a low calm tide. listening: rises with the voice.
 * thinking: low and quick. speaking: rises with the answer, its waves running the other way.
 */
export type GlowMode = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking';

// How high the light's crest stands above the bottom edge (pt), and how much it ripples.
// At rest the crest runs behind the controls, so they float on the horizon and the status
// line above them stays clear; a voice lifts it past them.
const CREST: Record<GlowMode, number> = {
  off: 0,
  idle: 64,
  listening: 70,
  thinking: 60,
  speaking: 74,
};
const WAVE: Record<GlowMode, number> = {
  off: 0,
  idle: 5,
  listening: 7,
  thinking: 4,
  speaking: 9,
};
// How far the voice (or the answer) lifts the crest and stirs the waves at full loudness.
const VOICE_LIFT = 110;
const VOICE_STIR = 14;
// The waves' speed in radians a second, and in which direction they run.
const WAVE_SPEED = 0.9;

// The light, painted by a small GPU program (SkSL). From the bottom edge up: a haze that
// thins toward the crest, a thin line of light along the crest, and a faint bloom above it.
// Three soft lobes drift along the band, so the light is never even. A pinch of grain keeps
// the long fades from banding. (`smoothstep` always takes its low edge first.)
const GLOW_SKSL = `
uniform float2 uSize;
uniform float uCrest;
uniform float uWave;
uniform float uPhase;
uniform float3 uLobes;
uniform float uBody;
uniform float uRim;
uniform float uBloom;
uniform float3 uTint;

half4 main(float2 p) {
  float y = uSize.y - p.y;
  float crest = uCrest + uWave * (0.6 * sin(0.016 * p.x + uPhase) + 0.4 * sin(0.031 * p.x - 0.7 * uPhase));
  crest = max(crest, 0.5);
  float3 d = (float3(p.x) - uLobes) / (0.28 * uSize.x);
  float lobes = min(1.0, dot(exp(-d * d), float3(1.0)));
  float body = exp(-1.7 * y / crest) * (1.0 - smoothstep(crest - 8.0, crest + 18.0, y));
  float rim = exp(-abs(y - crest) / 1.8);
  float bloom = exp(-max(y - crest, 0.0) / 34.0) * smoothstep(crest - 12.0, crest, y);
  float shape = min(1.0, uCrest / 24.0);
  float a = shape * ((0.45 + 0.55 * lobes) * (uBody * body + uBloom * bloom) + uRim * rim * (0.35 + 0.65 * lobes));
  float grain = fract(52.9829189 * fract(dot(p, float2(0.06711056, 0.00583715)))) - 0.5;
  a = clamp(a + grain / 255.0, 0.0, 1.0);
  return half4(half3(uTint * a), half(a));
}
`;

// Compiled on first use, not at import time: the browser preview loads Skia a moment after
// this file. `false` means it was tried and failed (then a plain gradient is drawn).
let compiled: SkRuntimeEffect | false | undefined;

function glowEffect() {
  if (compiled === undefined) {
    try {
      compiled = Skia.RuntimeEffect.Make(GLOW_SKSL) ?? false;
    } catch {
      compiled = false;
    }
  }
  return compiled || null;
}

/** '#0A0A0A' → [0.04, 0.04, 0.04] for the shader. */
function rgb(hex: string) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
}

type HorizonGlowProps = {
  mode: GlowMode;
  /** The user's voice, 0–1, while listening. */
  level: SharedValue<number>;
  width: number;
  height: number;
  /** Space the phone keeps at the bottom edge (home indicator): the crest stands this much higher. */
  base?: number;
};

/**
 * Voice mode's light: a soft horizon that rises from the bottom edge of the chat. It stands
 * low while waiting, climbs and ripples with the user's voice, and swells again, waves
 * running the other way, while the answer is spoken. It pauses in the background; with
 * Reduce Motion it holds still and only its height says what is happening.
 */
export function HorizonGlow({ mode, level, width, height, base = 0 }: HorizonGlowProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const appActive = useAppActive();
  const moving = appActive && !reduceMotion && mode !== 'off';

  const crest = useSharedValue(0);
  const wave = useSharedValue(0);
  const direction = useSharedValue(1);
  const listening = useSharedValue(0);
  const speaking = useSharedValue(0);
  const thinking = useSharedValue(0);
  // Integrated on the UI thread, so changes of speed or direction never make it jump.
  const phase = useSharedValue(0);
  const seconds = useSharedValue(0);
  const answer = useSharedValue(0);

  useEffect(() => {
    const entering = crest.get() < 1;
    const ease = mode === 'off' ? Easing.bezier(0.4, 0, 1, 1) : Easing.bezier(0.2, 0, 0, 1);
    const ms = mode === 'off' ? 280 : entering ? 520 : 600;
    crest.set(withTiming(mode === 'off' ? 0 : CREST[mode] + base, { duration: ms, easing: ease }));
    wave.set(withTiming(WAVE[mode], { duration: 600 }));
    direction.set(withTiming(mode === 'speaking' ? -1 : 1, { duration: 900 }));
    listening.set(withTiming(mode === 'listening' ? 1 : 0, { duration: 400 }));
    speaking.set(withTiming(mode === 'speaking' ? 1 : 0, { duration: 400 }));
    thinking.set(withTiming(mode === 'thinking' ? 1 : 0, { duration: 400 }));
  }, [base, crest, direction, listening, mode, speaking, thinking, wave]);

  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    const dt = Math.min(timeSincePreviousFrame ?? 16, 64) / 1000;
    const t = seconds.get() + dt;
    seconds.set(t);
    phase.set(phase.get() + dt * WAVE_SPEED * direction.get() * (1 + 0.8 * thinking.get()));
    // The phone's voice gives no loudness readings, so the spoken answer gets a lively,
    // speech-like one: syllables of about 4 a second inside phrases of about 1 a second.
    const syllables = Math.sin(t * 27) * Math.sin(t * 5.7);
    const flutter = Math.sin(t * 37.7 + Math.sin(t * 3.1) * 2) * 0.5 + 0.5;
    const target = Math.min(1, Math.max(0, 0.42 + 0.32 * syllables + 0.22 * flutter));
    const prev = answer.get();
    answer.set(prev + (target - prev) * (1 - Math.exp(-dt / (target > prev ? 0.06 : 0.22))));
  }, false);

  useEffect(() => {
    frame.setActive(moving);
    return () => frame.setActive(false);
  }, [frame, moving]);

  const dark = theme.dark;
  const tint = rgb(dark ? '#FFFFFF' : theme.colors.glowCore);
  // On white, light can only show as a soft cool shade, so light mode keeps its line faint.
  const body = dark ? 0.3 : 0.42;
  const rim = dark ? 0.55 : 0.2;
  const bloom = dark ? 0.1 : 0.12;

  const uniforms = useDerivedValue(() => {
    const t = seconds.get();
    const voice = moving ? level.get() * listening.get() : 0;
    const ai = moving ? answer.get() * speaking.get() : 0;
    // A spoken answer lifts the light less than a voice does: the user is reading it then.
    const energy = Math.max(voice, ai * 0.5);
    // Three lobes drift along the band on slow, unrelated beats. The voice draws them in.
    const spread = 0.28 * (1 - 0.35 * listening.get());
    const sweep = thinking.get();
    const lobe = (period: number, offset: number) =>
      width * (0.5 + spread * Math.sin((2 * Math.PI * t) / period + offset));
    const breath = 0.9 + 0.1 * Math.sin((2 * Math.PI * t) / 4);
    return {
      uSize: [width, height],
      uCrest: crest.get() + VOICE_LIFT * energy,
      uWave: wave.get() + VOICE_STIR * energy,
      uPhase: phase.get(),
      uLobes: [
        lobe(7, 0) * (1 - sweep) + sweep * width * (0.5 + 0.42 * Math.sin((2 * Math.PI * t) / 1.6)),
        lobe(9.5, 2.1),
        lobe(13, 4.4),
      ],
      uBody: body * breath * (1 + 0.5 * energy),
      uRim: rim * (1 + 0.6 * energy),
      uBloom: bloom * (1 + energy),
      uTint: tint,
    };
  });

  const effect = glowEffect();

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, { width, height }]}
    >
      {effect ? (
        // One plain style object: the browser preview's canvas does not accept a style list.
        <Canvas colorSpace="srgb" style={{ width, height }}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : mode === 'off' ? null : (
        // The GPU program did not compile on this phone: a plain soft gradient instead.
        <LinearGradient
          colors={[
            withAlpha(dark ? '#FFFFFF' : theme.colors.glowCore, 0),
            withAlpha(dark ? '#FFFFFF' : theme.colors.glowCore, dark ? 0.22 : 0.4),
          ]}
          style={[styles.fallback, { height: CREST[mode] * 1.6 }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
  fallback: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});

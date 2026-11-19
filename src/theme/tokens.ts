// Design tokens, copied from the YAML block at the top of DESIGN.md.
// This is the only place for colors, type, sizes and shadows.
// All numbers are React Native points (dp).
import { Platform, type TextStyle } from 'react-native';

export const colors = {
  canvas: '#EFEEF3',
  canvasMist: '#E7E2EE',
  canvasGlow: '#DCCDF0',
  surface: '#FFFFFF',
  surfaceTray: '#F6F5F8',
  glassFill: '#FFFFFF99',
  hairline: '#110C2214',
  ink: '#0D0B12',
  onInk: '#FFFFFF',
  inkDisabled: '#CFCDD6',
  textSecondary: '#5C5868',
  textTertiary: '#6B6777',
  accent: '#6E22DD',
  accentSoft: '#F0E8FC',
  orbPurple: '#8443DF',
  orbMagenta: '#B33B9C',
  orbBlush: '#F2C0D3',
  orbPale: '#F7D3DC',
  codeBg: '#F4F2F8',
  danger: '#C42B26',
  dangerSoft: '#FCEDEC',
  success: '#1E7F46',
  scrim: '#0D0B1266',
} as const;

// Each weight is its own font file. Never set `fontWeight` with these (it breaks on Android).
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  displaySoft: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  title: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  titleSm: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 16, letterSpacing: 0.1 },
  micro: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.3 },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20 },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 28,
  // Floating panels that sit close to the screen's own rounded corners (the history drawer).
  '3xl': 36,
  full: 999,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
  gutter: 16,
} as const;

// Shadow strings from "Elevation & Depth". Used with the `boxShadow` style prop.
// Each one is two layers: a tight one that seats the surface, and a wide soft one for air.
export const shadows = {
  rest: '0px 1px 2px rgba(42, 26, 74, 0.04), 0px 6px 20px rgba(42, 26, 74, 0.06)',
  float: '0px 2px 6px rgba(42, 26, 74, 0.05), 0px 14px 36px rgba(42, 26, 74, 0.11)',
  lifted: '0px 4px 10px rgba(42, 26, 74, 0.06), 0px 22px 56px rgba(42, 26, 74, 0.18)',
  photo: '0px 8px 18px rgba(20, 10, 40, 0.18)',
  // Glass buttons: a soft seat below and a thin line of light along the top edge.
  glass: '0px 4px 14px rgba(42, 26, 74, 0.07), inset 0px 1px 0px rgba(255, 255, 255, 0.85)',
} as const;

export const sizes = {
  iconButton: 44,
  sendButton: 44,
  attachButton: 36,
  suggestionTile: 108,
  // The tinted square that holds a tile's icon.
  tileIconChip: 32,
  // The hero orb of a new chat grows with the free space, between these two sizes.
  orbHeroMin: 56,
  orbHeroMax: 128,
  // The small orb beside the assistant's name: above each answer, and in the drawer.
  orbAvatar: 28,
  orbVoice: 220,
  greetingMaxWidth: 320,
  icon: { header: 22, send: 20, attach: 20, tile: 18, action: 18, chip: 16 },
  // Smallest tap area: 44pt on iOS, 48dp on Android.
  minTouch: Platform.OS === 'android' ? 48 : 44,
} as const;

// Text scaling caps (the Scaling Rule in DESIGN.md).
export const fontScaleCap = {
  chrome: 1.3,
  message: 1.6,
} as const;

// Extra tap area so a control of `size` reaches the minimum touch target.
export function hitSlopFor(size: number) {
  const slop = Math.max(0, (sizes.minTouch - size) / 2);
  return { top: slop, bottom: slop, left: slop, right: slop };
}

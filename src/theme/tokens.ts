// Design tokens: the only place for colors, type, sizes and shadows.
// All numbers are React Native points (dp).
//
// Sovrns is black and white. Two palettes share the same keys, one for light mode and one for
// dark mode; components read the active one through `useTheme()` (theme/theme.ts), never from
// this file directly. Gray steps carry the hierarchy, so there is no brand accent color: the
// one strong fill is `primary` (black in light mode, white in dark mode), used for Speak, Send
// and Stop.
import { Platform, type TextStyle } from 'react-native';

export type SchemeName = 'light' | 'dark';

export type Palette = {
  /** The chat screen. */
  background: string;
  /** The history drawer, one quiet step away from the chat so the two read as two layers. */
  sidebar: string;
  /** Filled cards on the background: the composer, suggestion cards, attach tiles. */
  surface: string;
  /** Things that float above everything: sheets, dialogs, the scroll button. */
  elevated: string;
  /** Round tool buttons inside the composer, the search field, segmented tracks. */
  fill: string;
  /** Selected rows, disabled buttons, skeleton lines. */
  fillStrong: string;
  /** The user's message bubble. */
  bubble: string;
  codeBg: string;
  /** Borders and dividers. */
  hairline: string;
  /** A finger on a row or a quiet button. */
  pressed: string;

  text: string;
  textSecondary: string;
  /** Placeholders, captions, section labels and quiet icons. */
  textTertiary: string;

  /** The one strong fill: Speak, Send, Stop, Save. Black in light mode, white in dark mode. */
  primary: string;
  /** Text and icons on `primary`. */
  onPrimary: string;

  /** The logo's name. The swoosh under it keeps the logo's own gold. */
  mark: string;

  danger: string;
  dangerSoft: string;

  /** Behind sheets, dialogs and the open drawer. */
  scrim: string;
  /** Selected text (Android) and the text selection tint. */
  selection: string;

  /** Voice mode's light: a pale cool white that rises from the bottom edge. */
  glowCore: string;
  glowHalo: string;
};

const light: Palette = {
  background: '#FFFFFF',
  sidebar: '#F9F9F9',
  surface: '#FCFCFC',
  elevated: '#FFFFFF',
  fill: '#F2F2F2',
  fillStrong: '#E6E6E6',
  bubble: '#F4F4F4',
  codeBg: '#F7F7F7',
  hairline: '#00000017',
  pressed: '#0000000D',

  text: '#0A0A0A',
  textSecondary: '#6B6B6B',
  textTertiary: '#767676',

  primary: '#000000',
  onPrimary: '#FFFFFF',

  mark: '#0A0A0A',

  danger: '#C2321F',
  dangerSoft: '#FDEFEE',

  scrim: '#00000033',
  selection: '#0000002E',

  glowCore: '#5E6B85',
  glowHalo: '#E6ECF7',
};

const dark: Palette = {
  background: '#000000',
  sidebar: '#0B0B0B',
  surface: '#171717',
  elevated: '#1C1C1C',
  fill: '#262626',
  fillStrong: '#2E2E2E',
  bubble: '#1C1C1C',
  codeBg: '#111111',
  hairline: '#FFFFFF1A',
  pressed: '#FFFFFF14',

  text: '#F5F5F5',
  textSecondary: '#A2A2A2',
  textTertiary: '#858585',

  primary: '#FFFFFF',
  onPrimary: '#000000',

  mark: '#F5F5F5',

  danger: '#FF7B72',
  dangerSoft: '#2A1211',

  scrim: '#00000080',
  selection: '#FFFFFF40',

  glowCore: '#FFFFFF',
  glowHalo: '#1C2333',
};

/**
 * Colors that never change with the theme: the picture viewer is always black, and the small
 * "×" and "+N" badges sit on photos of any color.
 */
export const fixed = {
  black: '#000000',
  white: '#FFFFFF',
} as const;

// Shadow strings for the `boxShadow` style prop. On black, shadows don't read, so dark mode
// lifts things with a lighter surface and a hairline instead.
export type Shadows = {
  /** A barely-there seat for small things that float (the scroll button). */
  rest: string;
  /** The composer and other surfaces that sit over content. */
  float: string;
  /** Sheets, dialogs and menus. */
  lifted: string;
  /** Pictures in the chat. */
  photo: string;
};

const lightShadows: Shadows = {
  rest: '0px 1px 2px rgba(0, 0, 0, 0.05)',
  float: '0px 2px 6px rgba(0, 0, 0, 0.03), 0px 8px 12px rgba(0, 0, 0, 0.03)',
  lifted: '0px 2px 8px rgba(0, 0, 0, 0.08), 0px 12px 40px rgba(0, 0, 0, 0.18)',
  photo: '0px 2px 10px rgba(0, 0, 0, 0.10)',
};

const darkShadows: Shadows = {
  rest: '0px 0px 0px rgba(0, 0, 0, 0)',
  float: '0px 2px 6px rgba(0, 0, 0, 0.12), 0px 8px 12px rgba(0, 0, 0, 0.10)',
  lifted: '0px 2px 8px rgba(0, 0, 0, 0.35), 0px 12px 40px rgba(0, 0, 0, 0.55)',
  photo: '0px 0px 0px rgba(0, 0, 0, 0)',
};

export type Theme = {
  name: SchemeName;
  dark: boolean;
  colors: Palette;
  shadows: Shadows;
};

export const themes: Record<SchemeName, Theme> = {
  light: { name: 'light', dark: false, colors: light, shadows: lightShadows },
  dark: { name: 'dark', dark: true, colors: dark, shadows: darkShadows },
};

// Sora for all text (titles, headings and the logo name too), Geist Mono for code.
// Sora has no italic files, so the italic keys use the upright ones. Each
// weight and style is its own font file, so a style picks the file here. Never set
// `fontWeight` or `fontStyle` on this text: Android ignores them for custom fonts, and the
// web preview fakes them. Two weights carry the interface (regular and medium);
// semibold is only for bold words inside answers.
export const fonts = {
  regular: 'Sora_400Regular',
  italic: 'Sora_400Regular',
  medium: 'Sora_500Medium',
  semibold: 'Sora_600SemiBold',
  semiboldItalic: 'Sora_600SemiBold',
  mono: 'GeistMono_400Regular',
} as const;

// Bigger sizes get tighter tracking, the way the phone's own display sizes do.
export const typography = {
  display: { fontFamily: fonts.medium, fontSize: 25, lineHeight: 31, letterSpacing: -0.6 },
  title: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, letterSpacing: -0.25 },
  titleSm: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, letterSpacing: -0.15 },
  body: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 24, letterSpacing: -0.05 },
  bodySm: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, letterSpacing: -0.05 },
  // A chat's name in the history drawer.
  row: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, letterSpacing: -0.15 },
  button: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, letterSpacing: -0.15 },
  caption: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16 },
  label: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, letterSpacing: -0.05 },
  micro: { fontFamily: fonts.medium, fontSize: 10.5, lineHeight: 13 },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 19 },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  // The composer.
  xl: 26,
  // The top corners of a bottom sheet.
  sheet: 30,
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

export const sizes = {
  iconButton: 44,
  // The composer's strong round button: Speak (voice bars), Send or Stop.
  sendButton: 34,
  // The round + button inside the composer.
  composerButton: 34,
  // The logo (the name over its swoosh), by width: on a new chat and in Settings.
  logo: { hero: 128, footer: 64 },
  drawerMaxWidth: 340,
  icon: { header: 22, send: 18, composer: 20, sheet: 24, action: 18, chip: 22, row: 20 },
  // Smallest tap area: 44pt on iOS, 48dp on Android.
  minTouch: Platform.OS === 'android' ? 48 : 44,
} as const;

// Text scaling caps: chrome stops growing sooner than reading text.
export const fontScaleCap = {
  chrome: 1.3,
  message: 1.6,
} as const;

// Extra tap area so a control of `size` reaches the minimum touch target.
export function hitSlopFor(size: number) {
  const slop = Math.max(0, (sizes.minTouch - size) / 2);
  return { top: slop, bottom: slop, left: slop, right: slop };
}

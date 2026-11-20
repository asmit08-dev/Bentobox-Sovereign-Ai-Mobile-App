// The active theme (light or dark) and the user's Appearance choice (System, Light or Dark).
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createFileStorage } from '@/lib/storage';
import { themes, type SchemeName, type Theme } from '@/theme/tokens';

export type AppearanceChoice = 'system' | 'light' | 'dark';

type SettingsState = {
  appearance: AppearanceChoice;
  /** True once the saved settings have been loaded. */
  hydrated: boolean;
  setAppearance: (appearance: AppearanceChoice) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      appearance: 'system',
      hydrated: false,
      setAppearance: (appearance) => set({ appearance }),
    }),
    {
      name: 'sovrns-settings',
      version: 1,
      storage: createJSONStorage(createFileStorage),
      partialize: (state) => ({ appearance: state.appearance }),
      // Called once loading ends, whether it worked or not (a missing or broken file just means
      // the defaults), so the app never waits on it forever. Deferred one tick: with the web
      // preview's instant storage this runs before the store above exists.
      onRehydrateStorage: () => () => {
        setTimeout(() => useSettingsStore.setState({ hydrated: true }), 0);
      },
    },
  ),
);

/** Light or dark, from the user's choice, or from the phone when the choice is System. */
export function useSchemeName(): SchemeName {
  const system = useColorScheme();
  const appearance = useSettingsStore((state) => state.appearance);
  if (appearance !== 'system') return appearance;
  return system === 'dark' ? 'dark' : 'light';
}

/** The active theme: its colors, shadows and name. */
export function useTheme(): Theme {
  return themes[useSchemeName()];
}

type StyleInput = Parameters<typeof StyleSheet.create>[0];

/**
 * Builds a style sheet from the theme. Call it once at module level and use the returned hook
 * in the component: `const styles = useStyles();`. Each theme's sheet is made once and reused.
 */
export function makeStyles<T extends StyleInput>(factory: (theme: Theme) => T) {
  const sheets: Partial<Record<SchemeName, Readonly<T>>> = {};
  return function useStyles(): Readonly<T> {
    const theme = useTheme();
    let sheet = sheets[theme.name];
    if (!sheet) {
      sheet = StyleSheet.create(factory(theme));
      sheets[theme.name] = sheet;
    }
    return sheet;
  };
}

/**
 * Keeps the phone in step with the app's theme: native alerts, menus and the keyboard follow
 * the user's choice, and the window behind the app has the theme's background, so screens
 * never flash white in dark mode while they open.
 */
export function useApplyTheme() {
  const appearance = useSettingsStore((state) => state.appearance);
  const hydrated = useSettingsStore((state) => state.hydrated);
  const theme = useTheme();

  useEffect(() => {
    if (!hydrated || Platform.OS === 'web') return;
    Appearance.setColorScheme(appearance === 'system' ? 'auto' : appearance);
  }, [appearance, hydrated]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => {});
  }, [theme]);
}

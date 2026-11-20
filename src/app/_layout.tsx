// Each weight is imported from its own folder: the package's main file would bundle every weight.
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSkiaReady } from '@/lib/skia-ready';
import { useApplyTheme, useSettingsStore, useTheme } from '@/theme/theme';

// Keep the splash screen up until the fonts and the saved Appearance choice are ready,
// so a dark-mode user never sees a light frame.
SplashScreen.preventAutoHideAsync();

// The keys are the names that theme/tokens.ts `fonts` uses.
const FONTS = {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  GeistMono_400Regular,
};

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const skiaReady = useSkiaReady();
  const settingsReady = useSettingsStore((state) => state.hydrated);
  const theme = useTheme();
  // If the fonts fail to load, still open the app (text falls back to the system font).
  const ready = (fontsLoaded || fontError != null) && skiaReady && settingsReady;

  useApplyTheme();

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="index" />
          {/* Full-screen pictures, always on black. */}
          <Stack.Screen
            name="viewer"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

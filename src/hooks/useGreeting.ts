import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** "Good morning" (5:00–11:59), "Good afternoon" (12:00–16:59), else "Good evening". */
export function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The greeting for right now. It is checked again each time the app comes back to the front. */
export function useGreeting() {
  const [greeting, setGreeting] = useState(() => greetingFor(new Date()));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setGreeting(greetingFor(new Date()));
    });
    return () => subscription.remove();
  }, []);

  return greeting;
}

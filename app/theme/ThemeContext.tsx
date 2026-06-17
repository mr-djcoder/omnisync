import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { colorScheme } from 'nativewind';
import * as SecureStore from 'expo-secure-store';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'theme_pref';

type ThemePrefState = {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
};

const ThemePrefContext = createContext<ThemePrefState | null>(null);

function isPref(v: string | null): v is ThemePref {
  return v === 'system' || v === 'light' || v === 'dark';
}

// Applies a persisted light/dark/system override on top of the OS scheme.
// NativeWind's colorScheme drives both the CSS variables and the dark: variant.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(KEY).then((v) => {
      if (!active) return;
      const p = isPref(v) ? v : 'system';
      setPrefState(p);
      colorScheme.set(p);
    });
    return () => {
      active = false;
    };
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    colorScheme.set(p);
    void SecureStore.setItemAsync(KEY, p);
  };

  return (
    <ThemePrefContext.Provider value={{ pref, setPref }}>{children}</ThemePrefContext.Provider>
  );
}

export function useThemePref(): ThemePrefState {
  const ctx = useContext(ThemePrefContext);
  if (!ctx) throw new Error('useThemePref must be used within ThemeProvider');
  return ctx;
}

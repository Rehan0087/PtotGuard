"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_TAGS,
  type Locale,
} from "./config";
import { getDictionary, type Dictionary } from "./dictionaries";

interface LocaleContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Holds the active language. The initial value comes from the server (cookie),
 * so SSR and the first client render agree; switching afterwards is pure client
 * state — a re-render, not a reload, since every string is read through `useT()`.
 */
export function LocaleProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // Keep <html lang> honest: it drives screen-reader pronunciation, font
    // fallback heuristics, and line breaking for Bengali.
    document.documentElement.lang = LOCALE_TAGS[next];
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: getDictionary(locale), setLocale }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside <LocaleProvider>");
  return ctx;
}

/** The active dictionary. The hook most components want: `const t = useT()`. */
export function useT(): Dictionary {
  return useLocaleContext().t;
}

/** The active locale tag plus the setter — for the language toggle and `Intl`. */
export function useLocale(): { locale: Locale; setLocale: (next: Locale) => void } {
  const { locale, setLocale } = useLocaleContext();
  return { locale, setLocale };
}

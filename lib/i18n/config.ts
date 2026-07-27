/**
 * Locale configuration. Kept free of React and of the dictionaries themselves
 * so both the server layout and the client provider can import it.
 */

export const LOCALES = ["en", "bn"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Locale lives in a cookie, not localStorage: the root layout reads it during
 * SSR so the first paint is already in the right language. A localStorage
 * approach (what `use-theme` does) can't be read on the server, and text — unlike
 * a `.dark` class — can't be patched in before hydration without a mismatch.
 */
export const LOCALE_COOKIE = "plotguard-locale";

/** One year. Locale is a preference, not a session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language named in itself — never "Bengali" to a Bangla reader. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  bn: "বাংলা",
};

/** Short form for the toggle button face. */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  en: "EN",
  bn: "বাং",
};

/** BCP-47 tags for `Intl` and the `lang` attribute. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en",
  bn: "bn-BD",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "bn";
}

export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

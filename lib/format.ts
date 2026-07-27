import { format, formatDistanceToNow, parseISO } from "date-fns";
import { bn as bnLocale } from "date-fns/locale/bn";
import type { Area, AreaUnit, Money, ISODateString } from "@/lib/types";
import { DEFAULT_LOCALE, LOCALE_TAGS, type Locale } from "@/lib/i18n/config";

/**
 * Locale-aware formatting. Every function takes the active locale explicitly so
 * this module stays pure and usable outside React; screens get a pre-bound set
 * from `useFmt()` (lib/i18n/format.ts) instead of threading it through by hand.
 *
 * What does *not* get localised is as deliberate as what does: dag and khatian
 * numbers, jurisdiction codes, case numbers, and coordinates are identifiers
 * people copy, cite, and search on. Rendering "CS-১৪২" would make a record
 * uncitable, so identifiers stay Latin in both languages while quantities —
 * dates, areas, money, counts — follow the reader.
 */

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

/**
 * Western digits → Bengali. `Intl` handles this for numbers it formats, but
 * date-fns emits Latin digits even under its `bn` locale (only ordinals are
 * localised), so formatted dates are passed through here.
 */
export function toBengaliDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => BENGALI_DIGITS[Number(d)]);
}

/** Digits in the reader's script. Latin locales pass through untouched. */
export function localizeDigits(s: string, locale: Locale = DEFAULT_LOCALE): string {
  return locale === "bn" ? toBengaliDigits(s) : s;
}

/** "field-visit-scheduled" -> "Field Visit Scheduled" */
export function humanize(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sentence case: "field-visit" -> "Field visit".
 *
 * Only for open-ended strings that have no fixed set to translate against —
 * audit `action` is typed `AuditAction | string`, so an unknown verb still has
 * to render as something. Closed enums go through the dictionary instead.
 */
export function sentenceCase(s: string): string {
  const t = s.replace(/[-_]/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function formatDate(
  iso: ISODateString,
  locale: Locale = DEFAULT_LOCALE,
  pattern = "d MMM yyyy",
): string {
  try {
    const out = format(parseISO(iso), pattern, {
      locale: locale === "bn" ? bnLocale : undefined,
    });
    return localizeDigits(out, locale);
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: ISODateString, locale: Locale = DEFAULT_LOCALE): string {
  return formatDate(iso, locale, "d MMM yyyy · HH:mm");
}

export function fromNow(iso: ISODateString, locale: Locale = DEFAULT_LOCALE): string {
  try {
    return formatDistanceToNow(parseISO(iso), {
      addSuffix: true,
      locale: locale === "bn" ? bnLocale : undefined,
    });
  } catch {
    return iso;
  }
}

/** Plain number. `bn-BD` brings both Bengali digits and lakh/crore grouping. */
export function formatNumber(n: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale]).format(n);
}

export function formatPercent(
  fraction: number,
  locale: Locale = DEFAULT_LOCALE,
  digits = 0,
): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(fraction);
}

/**
 * @param unitLabels the `domain.areaUnit` block of the active dictionary —
 *   "decimal"/"katha" in English, "শতাংশ"/"কাঠা" in Bangla.
 */
export function formatArea(
  a: Area,
  locale: Locale = DEFAULT_LOCALE,
  unitLabels?: Record<AreaUnit, string>,
): string {
  const unit = unitLabels?.[a.unit] ?? a.unit;
  return `${formatNumber(a.value, locale)} ${unit}`;
}

export function formatMoney(m: Money, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    style: "currency",
    currency: m.currency,
    maximumFractionDigits: 0,
  }).format(m.amount);
}

/**
 * Human, hemisphere-aware coordinate label: "23.51957°N, 91.85535°E".
 * Deliberately Latin in both locales — a coordinate is read off and typed into
 * other instruments, so its digits have to survive a copy-paste.
 */
export function formatCoord(lat: number, lng: number): string {
  const f = (n: number) => Math.abs(n).toFixed(5);
  return `${f(lat)}°${lat >= 0 ? "N" : "S"}, ${f(lng)}°${lng >= 0 ? "E" : "W"}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

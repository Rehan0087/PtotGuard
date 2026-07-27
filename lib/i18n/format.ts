"use client";

import { useMemo } from "react";
import type { Area, ISODateString, Money } from "@/lib/types";
import {
  formatArea,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  fromNow,
  localizeDigits,
} from "@/lib/format";
import { useLocale, useT } from "./provider";

export interface Formatters {
  date: (iso: ISODateString, pattern?: string) => string;
  dateTime: (iso: ISODateString) => string;
  fromNow: (iso: ISODateString) => string;
  number: (n: number) => string;
  percent: (fraction: number, digits?: number) => string;
  area: (a: Area) => string;
  money: (m: Money) => string;
  /** Byte count with its unit word — "1.4 MB" / "১.৪ এমবি". */
  fileSize: (bytes: number) => string;
  /** Digits inside a string that is otherwise already built (e.g. "1/8"). */
  digits: (s: string) => string;
}

/**
 * Formatters bound to the active locale and dictionary, so a screen writes
 * `f.date(x)` instead of passing the locale to every call. Area needs the
 * dictionary as well as the locale — its unit names are words, not numbers.
 */
export function useFmt(): Formatters {
  const { locale } = useLocale();
  const t = useT();

  return useMemo(
    () => ({
      date: (iso, pattern) => formatDate(iso, locale, pattern),
      dateTime: (iso) => formatDateTime(iso, locale),
      fromNow: (iso) => fromNow(iso, locale),
      number: (n) => formatNumber(n, locale),
      percent: (fraction, digits) => formatPercent(fraction, locale, digits),
      area: (a) => formatArea(a, locale, t.domain.areaUnit),
      money: (m) => formatMoney(m, locale),
      fileSize: (bytes) => {
        const u = t.common.byteUnits;
        if (bytes < 1024) return `${formatNumber(bytes, locale)} ${u.b}`;
        if (bytes < 1024 * 1024) {
          return `${formatNumber(Math.round(bytes / 1024), locale)} ${u.kb}`;
        }
        return `${localizeDigits((bytes / 1024 / 1024).toFixed(1), locale)} ${u.mb}`;
      },
      digits: (s) => localizeDigits(s, locale),
    }),
    [locale, t],
  );
}

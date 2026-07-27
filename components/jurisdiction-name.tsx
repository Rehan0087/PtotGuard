"use client";

import { useLocale } from "@/lib/i18n/provider";
import type { Jurisdiction } from "@/lib/types";

/**
 * A jurisdiction's name as the reader should see it.
 *
 * Records in Cumilla are kept in Bangla, and `Jurisdiction.nameBn` carries that
 * form — so a Bangla reader gets "দেবিদ্বার উপজেলা" where an English reader gets
 * "Debidwar Upazila". `nameBn` is optional and nothing keys off it (search,
 * sorting, and codes all use `name`), so the Latin name stays the fallback.
 *
 * The `lang` attribute is set per branch: it doesn't pick the font — Noto Sans
 * Bengali is already in every stack — but it drives screen-reader pronunciation
 * and line breaking, which matter more when the two scripts sit side by side.
 */
export function JurisdictionName({
  jurisdiction,
  className,
}: {
  jurisdiction: Pick<Jurisdiction, "name" | "nameBn">;
  className?: string;
}) {
  const { locale } = useLocale();
  const bengali = locale === "bn" && jurisdiction.nameBn;

  return (
    <span className={className} lang={bengali ? "bn" : "en"}>
      {bengali ? jurisdiction.nameBn : jurisdiction.name}
    </span>
  );
}

/** The same choice as a plain string, for `title`/`aria-label` and interpolation. */
export function useJurisdictionName() {
  const { locale } = useLocale();
  return (j: Pick<Jurisdiction, "name" | "nameBn"> | undefined | null) =>
    (locale === "bn" ? j?.nameBn : undefined) ?? j?.name ?? "";
}

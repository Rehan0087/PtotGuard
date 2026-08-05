/**
 * ULPIN — a citable, unique identifier for one plot of land.
 *
 * Modelled on India's Unique Land Parcel Identification Number: a citizen can
 * quote one string instead of reciting a division, district, upazila, mouza,
 * dag, and khatian and hoping every part survives the retelling.
 *
 * `ILR-CUM-DEB-000142` — programme prefix, district, upazila, sequence.
 *
 * The district and upazila are carried in the identifier on purpose. It makes
 * the number legible to a clerk who knows the area, and it means a mistyped
 * digit usually lands on nothing rather than silently on a real plot in a
 * different upazila.
 */
import type { Jurisdiction } from "./types";
import { ancestryOf } from "./jurisdictions";

export const ULPIN_PREFIX = "ILR";
const SEQUENCE_DIGITS = 6;

/** `ILR-<district>-<upazila>-<6 digits>`, uppercase, hyphen-separated. */
const ULPIN_PATTERN = /^ILR-[A-Z0-9]+-[A-Z0-9]+-\d{6}$/;

/**
 * The distinctive tail of a hierarchical code: `CTG-CUM-DEB` → `DEB`.
 * Jurisdiction codes nest their ancestors, which is right for the tree and
 * far too long for something a person reads aloud.
 */
function tail(code: string): string {
  const parts = code.split("-").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : code;
}

export type UlpinRefusal =
  | { code: "unknown-jurisdiction" }
  | { code: "missing-level"; level: "district" | "upazila" }
  | { code: "sequence-out-of-range"; max: number };

export type UlpinResult =
  | { ok: true; ulpin: string }
  | { ok: false; refusal: UlpinRefusal };

/**
 * Build the identifier for a parcel sitting at `jurisdictionId`.
 *
 * @param sequence Per-upazila running number, 1-based. Scoped to the upazila
 *   rather than global because the upazila is already in the string — a global
 *   counter would make two adjacent plots look unrelated and waste the range.
 *
 * Returns a refusal rather than throwing or inventing a placeholder: a parcel
 * hanging off a district with no upazila is a real (if broken) shape in this
 * tree, and quietly stamping it `ILR-CUM-XX-000001` would mint an identifier
 * that looks citable and isn't.
 */
export function buildUlpin(
  jurisdictionId: string,
  all: Jurisdiction[],
  sequence: number,
): UlpinResult {
  const chain = ancestryOf(jurisdictionId, all);
  if (chain.length === 0) return { ok: false, refusal: { code: "unknown-jurisdiction" } };

  const district = chain.find((j) => j.level === "district");
  if (!district) return { ok: false, refusal: { code: "missing-level", level: "district" } };

  const upazila = chain.find((j) => j.level === "upazila");
  if (!upazila) return { ok: false, refusal: { code: "missing-level", level: "upazila" } };

  const max = 10 ** SEQUENCE_DIGITS - 1;
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > max) {
    return { ok: false, refusal: { code: "sequence-out-of-range", max } };
  }

  const ulpin = [
    ULPIN_PREFIX,
    tail(district.code).toUpperCase(),
    tail(upazila.code).toUpperCase(),
    String(sequence).padStart(SEQUENCE_DIGITS, "0"),
  ].join("-");

  return { ok: true, ulpin };
}

/**
 * Is this string shaped like a ULPIN? Used to decide whether a search box
 * holds an identifier or free text — not to decide whether the plot exists.
 */
export function isUlpin(value: string): boolean {
  return ULPIN_PATTERN.test(value.trim().toUpperCase());
}

/** Normalise user input for lookup: `  ilr-cum-deb-000142 ` → `ILR-CUM-DEB-000142`. */
export function normaliseUlpin(value: string): string {
  return value.trim().toUpperCase();
}

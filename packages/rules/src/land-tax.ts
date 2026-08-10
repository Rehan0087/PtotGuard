/**
 * Land development tax (ভূমি উন্নয়ন কর — khajna): what a holding owes, and why.
 *
 * **The rates are not in this file, deliberately.** They arrive as
 * `LandTaxRates`, read from the admin-set Policy row. Statutory rates change
 * by finance act and are not uniform across the country, so hardcoding a
 * number here would bake one district's schedule from one year into the
 * binary and quietly misbill everyone else. What *is* encoded here is the
 * shape of the assessment — how area, land use, exemption, arrears, and
 * surcharge combine — because that structure is stable and is what needs
 * testing.
 *
 * Pure, like every rule here: the same arithmetic on the server that charges
 * and on the screen that itemises the bill.
 */
import type { Area, LandUse } from "./types";
import { toDecimals } from "./area";

export interface LandTaxRates {
  /** BDT per decimal per year, by land use. */
  perDecimalByLandUse: Record<LandUse, number>;
  /**
   * Agricultural holdings at or below this many decimals owe nothing —
   * smallholder relief, which Bangladesh grants by holding size.
   */
  agriculturalExemptionDecimals: number;
  /** Added per whole year an assessment stays unpaid, as a percentage. */
  arrearSurchargePercent: number;
  /**
   * How many years back arrears are billed. Recovery windows are bounded in
   * practice, and without one a plot on the register since 1990 presents a
   * thirty-seven-line bill carrying several times its own assessment in
   * surcharge — arithmetically consistent and useless to the person paying it.
   * Older liability is not erased, it is simply not collected on this counter.
   */
  maxArrearYears: number;
}

/** Why a holding owes nothing. A code, not a sentence — the screen words it. */
export type ExemptionReason =
  | { code: "smallholder-agricultural"; thresholdDecimals: number }
  | { code: "zero-rated"; landUse: LandUse };

/** One year's charge on the ledger. */
export interface LandTaxYear {
  year: number;
  /** The year's own assessment, before any surcharge. */
  assessed: number;
  /** Added because this year went unpaid — 0 for the current year. */
  surcharge: number;
  /** assessed + surcharge. */
  due: number;
  /** True for every year before the one being assessed. */
  isArrear: boolean;
}

export interface LandTaxAssessment {
  /** Holding size in decimals, the unit the rate applies per. */
  decimals: number;
  /** Set when nothing is owed; `years` is empty and `total` is 0. */
  exemption: ExemptionReason | null;
  /** Oldest first, so the ledger reads top-down like a passbook. */
  years: LandTaxYear[];
  /** Everything owed for years before `assessmentYear`, surcharge included. */
  arrears: number;
  /** The current year's charge alone. */
  currentYearDue: number;
  /** arrears + currentYearDue. */
  total: number;
}

export interface LandTaxInput {
  area: Area;
  landUse: LandUse;
  /** The year being billed. */
  assessmentYear: number;
  /**
   * Tax is settled through the end of this year. `null` means never paid, in
   * which case the ledger runs from `liableFromYear`.
   */
  paidThroughYear: number | null;
  /**
   * The first year this holding was taxable — normally its registration year.
   * Bounds the arrears so a long-held plot doesn't accrue an unbounded ledger.
   */
  liableFromYear: number;
}

/**
 * What this holding owes for `assessmentYear` and every unpaid year before it.
 *
 * Exemption is decided before any arithmetic: an exempt holding owes nothing
 * for *any* year, including past ones, rather than accruing arrears that a
 * later exemption would have to unwind.
 */
export function assessLandTax(input: LandTaxInput, rates: LandTaxRates): LandTaxAssessment {
  const decimals = toDecimals(input.area);
  const perDecimal = rates.perDecimalByLandUse[input.landUse] ?? 0;

  const exemption = exemptionFor(input.landUse, decimals, perDecimal, rates);
  if (exemption) {
    return { decimals, exemption, years: [], arrears: 0, currentYearDue: 0, total: 0 };
  }

  const assessed = toTaka(decimals * perDecimal);
  const firstUnpaid = Math.max(
    input.liableFromYear,
    input.paidThroughYear === null ? input.liableFromYear : input.paidThroughYear + 1,
    input.assessmentYear - rates.maxArrearYears,
  );

  const years: LandTaxYear[] = [];
  for (let year = firstUnpaid; year <= input.assessmentYear; year++) {
    const yearsLate = input.assessmentYear - year;
    const surcharge = toTaka(assessed * (rates.arrearSurchargePercent / 100) * yearsLate);
    years.push({
      year,
      assessed,
      surcharge,
      due: toTaka(assessed + surcharge),
      isArrear: year < input.assessmentYear,
    });
  }

  const arrears = toTaka(sum(years.filter((y) => y.isArrear).map((y) => y.due)));
  const currentYearDue = toTaka(sum(years.filter((y) => !y.isArrear).map((y) => y.due)));

  return {
    decimals,
    exemption: null,
    years,
    arrears,
    currentYearDue,
    total: toTaka(arrears + currentYearDue),
  };
}

function exemptionFor(
  landUse: LandUse,
  decimals: number,
  perDecimal: number,
  rates: LandTaxRates,
): ExemptionReason | null {
  if (landUse === "agricultural" && decimals <= rates.agriculturalExemptionDecimals) {
    return {
      code: "smallholder-agricultural",
      thresholdDecimals: rates.agriculturalExemptionDecimals,
    };
  }
  // A rate of zero is a policy choice (a land use the district does not tax),
  // not an absent rate — either way there is nothing to bill, and saying so
  // beats presenting a ledger of zeroes.
  if (perDecimal <= 0) return { code: "zero-rated", landUse };
  return null;
}

/**
 * Whole taka, per line and on the total.
 *
 * A challan is settled in taka, the payment record stores an integer, and the
 * screen renders whole taka — so the rounding happens once, here, and every
 * one of those reads the same number. Rounding only at the end instead would
 * leave a bill whose printed lines do not add up to its printed total, which
 * is the kind of arithmetic nobody should have to take on faith.
 */
function toTaka(n: number): number {
  return Math.round(n);
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

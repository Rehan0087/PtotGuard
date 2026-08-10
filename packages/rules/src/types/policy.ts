import type { LandUse } from "./parcel";

export interface Policy {
  mutationFeeBdt: number;
  objectionWindowDays: number;
  fraudScoreThreshold: number;
  /**
   * Land development tax settings. Here rather than in the rule that applies
   * them because statutory rates change by finance act and are not uniform
   * across the country — see assessLandTax().
   */
  landTaxRatePerDecimalBdt: Record<LandUse, number>;
  landTaxAgriculturalExemptionDecimals: number;
  landTaxArrearSurchargePercent: number;
  /** How many years back arrears are billed — see assessLandTax(). */
  landTaxMaxArrearYears: number;
}

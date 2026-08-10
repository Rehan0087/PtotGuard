import { IsInt, IsNumber, IsObject, IsOptional, Max, Min } from "class-validator";

/**
 * Every field optional — the admin screen PATCHes only what changed. Bounds
 * are here rather than in @plotguard/rules because they aren't domain rules
 * anyone reasons about; they're the range each value is meaningful in, and a
 * negative fee or a 3.0 threshold is a malformed request (400), not a policy
 * decision the system refuses on its merits (422).
 */
export class UpdatePoliciesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  mutationFeeBdt?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  objectionWindowDays?: number;

  /** 0..1 — see LandDocument.fraudScore, which this is compared against. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fraudScoreThreshold?: number;

  /** Record<LandUse, number>, BDT per decimal per year — see assessLandTax(). */
  @IsOptional()
  @IsObject()
  landTaxRatePerDecimalBdt?: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Min(0)
  landTaxAgriculturalExemptionDecimals?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  landTaxArrearSurchargePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  landTaxMaxArrearYears?: number;
}

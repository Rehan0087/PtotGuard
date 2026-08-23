import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const LAND_USES = ["agricultural", "non-agricultural"] as const;

/**
 * Lease & Settlement has no parcel to anchor to — the citizen is applying
 * for khas (government) land they don't yet hold, so there's nothing in
 * `Parcel` to point at. `locationDescription` plays the same role Revenue
 * Cases' `againstReference` does: a free-text reference the citizen
 * supplies and a land office officer verifies, not a foreign key.
 */
export class ApplyLeaseSettlementDto {
  @IsIn(LAND_USES)
  landUse!: (typeof LAND_USES)[number];

  @IsString()
  locationDescription!: string;

  @IsInt()
  @Min(1)
  areaDecimals!: number;

  @IsInt()
  @Min(1)
  @Max(99)
  termYears!: number;

  @IsString()
  purpose!: string;

  @IsOptional()
  documentIds?: string[];
}

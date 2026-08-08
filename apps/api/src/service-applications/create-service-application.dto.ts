import { IsIn, IsOptional, IsString } from "class-validator";

const SERVICE_TYPES = [
  "land-tax",
  "acquisition",
  "lease-settlement",
  "land-admin",
  "revenue-case",
  "info-bank-request",
] as const;

/** Starts an application as a draft — a citizen may not have decided every
 * field yet, so nothing here is required beyond which service this is. */
export class CreateServiceApplicationDto {
  @IsIn(SERVICE_TYPES)
  serviceType!: (typeof SERVICE_TYPES)[number];

  @IsOptional()
  @IsString()
  parcelId?: string;

  @IsOptional()
  details?: Record<string, unknown>;
}

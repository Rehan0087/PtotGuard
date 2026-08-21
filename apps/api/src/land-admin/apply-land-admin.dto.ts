import { IsIn, IsOptional, IsString, ValidateIf } from "class-validator";

const REQUEST_TYPES = ["certified-copy", "correction"] as const;
const CORRECTION_TYPES = ["name", "area", "other"] as const;

/**
 * A citizen may only ask for a copy of what's recorded (`certified-copy`) or
 * ask for it to be fixed (`correction`) — the latter is the only branch that
 * needs to say what's wrong and what it should say instead, so those fields
 * are validated only when `requestType` is `"correction"`.
 */
export class ApplyLandAdminDto {
  @IsString()
  parcelId!: string;

  @IsIn(REQUEST_TYPES)
  requestType!: (typeof REQUEST_TYPES)[number];

  @ValidateIf((dto: ApplyLandAdminDto) => dto.requestType === "correction")
  @IsIn(CORRECTION_TYPES)
  correctionType?: (typeof CORRECTION_TYPES)[number];

  @ValidateIf((dto: ApplyLandAdminDto) => dto.requestType === "correction")
  @IsString()
  currentValue?: string;

  @ValidateIf((dto: ApplyLandAdminDto) => dto.requestType === "correction")
  @IsString()
  correctedValue?: string;

  @ValidateIf((dto: ApplyLandAdminDto) => dto.requestType === "correction")
  @IsString()
  reason?: string;

  @IsOptional()
  documentIds?: string[];
}

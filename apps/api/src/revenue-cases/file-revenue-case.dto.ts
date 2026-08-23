import { IsIn, IsOptional, IsString, ValidateIf } from "class-validator";

const CASE_TYPES = ["miscellaneous", "appeal"] as const;

/**
 * `grounds` is required for both case types — a revenue case is a written
 * petition either way. `againstReference` is only meaningful for an appeal
 * (the citizen's own reference to what they're appealing, e.g. a memo or
 * order number) — there's no "Order" entity in this system to link to, so
 * it's free text, not a foreign key.
 */
export class FileRevenueCaseDto {
  @IsString()
  parcelId!: string;

  @IsIn(CASE_TYPES)
  caseType!: (typeof CASE_TYPES)[number];

  @IsString()
  grounds!: string;

  @ValidateIf((dto: FileRevenueCaseDto) => dto.caseType === "appeal")
  @IsString()
  againstReference?: string;

  @IsOptional()
  documentIds?: string[];
}

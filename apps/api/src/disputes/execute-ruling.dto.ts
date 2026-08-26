import { IsIn, IsOptional, IsString, ValidateIf } from "class-validator";

const ACTIONS = [
  "no-change",
  "restriction-added",
  "restriction-removed",
  "referred-to-mutation",
] as const;

const RESTRICTION_TYPES = [
  "mortgage",
  "injunction",
  "attachment",
  "acquisition",
  "non-transferable",
] as const;

export class ExecuteRulingDto {
  @IsIn(ACTIONS)
  action!: (typeof ACTIONS)[number];

  @ValidateIf((o: ExecuteRulingDto) => o.action === "restriction-added")
  @IsIn(RESTRICTION_TYPES)
  restrictionType?: (typeof RESTRICTION_TYPES)[number];

  @ValidateIf((o: ExecuteRulingDto) => o.action === "restriction-added")
  @IsString()
  authority?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @ValidateIf((o: ExecuteRulingDto) => o.action === "restriction-removed")
  @IsString()
  restrictionId?: string;
}

import { IsIn, IsOptional, IsString } from "class-validator";

const STATUSES = ["en-route"] as const;

export class UpdateFieldReportDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}

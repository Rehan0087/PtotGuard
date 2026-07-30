import { IsIn, IsOptional, IsString } from "class-validator";

const STATUSES = ["assigned", "en-route", "in-progress", "completed", "cancelled"] as const;

export class UpdateFieldReportDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}

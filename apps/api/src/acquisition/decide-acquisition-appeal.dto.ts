import { IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from "class-validator";
import type { AcquisitionAppealDecision } from "@plotguard/rules";

export class DecideAcquisitionAppealDto {
  @IsIn(["withdraw", "increase-compensation", "proceed"] satisfies AcquisitionAppealDecision[])
  decision!: AcquisitionAppealDecision;

  @ValidateIf((body: DecideAcquisitionAppealDto) => body.decision === "increase-compensation")
  @IsInt()
  @Min(1)
  @IsOptional()
  awardAmount?: number;

  @IsString()
  @IsOptional()
  note?: string;
}

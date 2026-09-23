import { IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from "class-validator";
import type { AcquisitionAppealOutcome } from "@plotguard/rules";

export class FileAcquisitionAppealDto {
  @IsIn(["withdraw", "increase-compensation"] satisfies AcquisitionAppealOutcome[])
  outcome!: AcquisitionAppealOutcome;

  @IsString()
  reason!: string;

  @ValidateIf((body: FileAcquisitionAppealDto) => body.outcome === "increase-compensation")
  @IsInt()
  @Min(1)
  @IsOptional()
  requestedAmount?: number;
}

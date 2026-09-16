import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength, ValidateIf } from "class-validator";

export class CompleteFieldSurveyDto {
  @IsString()
  @MinLength(1)
  notes!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsOptional()
  @IsBoolean()
  disputeFound?: boolean;

  @ValidateIf((body: CompleteFieldSurveyDto) => body.disputeFound === true)
  @IsString()
  @MinLength(1)
  disputeDescription?: string;
}

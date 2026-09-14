import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CompleteFieldSurveyDto {
  @IsString()
  @MinLength(1)
  notes!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

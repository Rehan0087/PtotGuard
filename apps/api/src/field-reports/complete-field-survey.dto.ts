import { IsString, MinLength } from "class-validator";

export class CompleteFieldSurveyDto {
  @IsString()
  @MinLength(1)
  notes!: string;
}

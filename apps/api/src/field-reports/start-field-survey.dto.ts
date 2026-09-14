import { IsOptional, IsUUID } from "class-validator";

export class StartFieldSurveyDto {
  @IsOptional()
  @IsUUID()
  localSessionId?: string;
}

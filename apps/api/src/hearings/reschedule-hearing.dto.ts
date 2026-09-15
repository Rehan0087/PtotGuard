import { IsOptional, IsString } from "class-validator";

export class RescheduleHearingDto {
  @IsString()
  hearingDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

import { IsDateString } from "class-validator";

export class ScheduleHearingDto {
  @IsDateString()
  hearingAt!: string;
}

import { IsOptional, IsString } from "class-validator";

export class BookAppointmentDto {
  @IsString()
  officeJurisdictionId!: string;

  @IsString()
  purpose!: string;

  /** The citizen's requested time — ISO date string. An officer may propose
   * a different one via reschedule(); this is only ever the opening ask. */
  @IsString()
  preferredAt!: string;

  @IsOptional()
  @IsString()
  parcelId?: string;
}

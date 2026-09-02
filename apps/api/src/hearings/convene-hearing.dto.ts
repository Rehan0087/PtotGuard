import { IsString } from "class-validator";

/**
 * Only the case and the date. The parcel and the parties are read off the
 * dispute rather than accepted from the caller — the hearing is over that
 * record, and a name supplied twice is a name that can differ from it.
 */
export class ConveneHearingDto {
  @IsString()
  disputeId!: string;

  @IsString()
  hearingDate!: string;
}

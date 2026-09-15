import { IsString } from "class-validator";

/** Only the incoming mediator; the endpoint checks they are one. */
export class ReassignHearingDto {
  @IsString()
  mediatorId!: string;
}

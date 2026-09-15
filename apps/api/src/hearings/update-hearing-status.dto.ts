import { IsIn, IsOptional, IsString } from "class-validator";

/**
 * Every status a hearing can hold. `ruled` and `in-hearing` are accepted by
 * the validator but refused by hearingTransition(), so a caller gets the
 * gate's "use the ruling / record a sitting" answer rather than a shapeless
 * 400 that does not say where to go instead.
 */
const STATUSES = ["scheduled", "in-hearing", "deliberation", "ruled", "appealed", "closed"] as const;

export class UpdateHearingStatusDto {
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];

  /** Why — an adjournment reason, the terms of a settlement, the ground of appeal. */
  @IsOptional()
  @IsString()
  note?: string;
}

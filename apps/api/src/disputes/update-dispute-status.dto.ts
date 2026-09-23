import { IsIn } from "class-validator";

/**
 * Every status a dispute can hold. `hearing-scheduled` and `decided` are
 * accepted by the validator but refused by `disputeTransition()`, so the
 * caller gets the gate's "use the hearing / use the ruling" answer rather
 * than a shapeless 400.
 */
const STATUSES = [
  "submitted",
  "under-land-office-review",
  "field-verified",
  "forwarded-to-settlement",
  "hearing-scheduled",
  "decided",
  "rejected",
  "withdrawn",
] as const;

export class UpdateDisputeStatusDto {
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];
}

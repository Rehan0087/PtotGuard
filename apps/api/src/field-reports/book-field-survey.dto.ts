import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

const PURPOSES = [
  "boundary-survey",
  "encroachment-check",
  "possession-verify",
  "measurement",
] as const;

export class BookFieldSurveyDto {
  @IsString()
  parcelId!: string;

  @IsOptional()
  @IsString()
  disputeId?: string;

  @IsIn(PURPOSES)
  purpose!: (typeof PURPOSES)[number];

  @IsString()
  assignedAgentId!: string;

  /** ISO date string — the picker sends a plain date-time, no timezone math needed. */
  @IsString()
  scheduledFor!: string;

  @IsOptional()
  @IsString()
  addressHint?: string;

  // The client's own escape hatch for a short-staffed area (rankCandidates()'s
  // allowOutsideJurisdiction) — carried explicitly so the server enforces the
  // same override the officer deliberately made, not a stricter or looser rule.
  @IsOptional()
  @IsBoolean()
  allowOutsideJurisdiction?: boolean;
}

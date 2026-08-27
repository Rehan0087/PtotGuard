import { IsIn, IsOptional, IsString } from "class-validator";

// Not "invited" — that state belongs to account creation, which this
// endpoint doesn't do (no real auth to issue an invite through yet).
const STATUSES = ["active", "suspended"] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  jurisdictionId?: string;
}

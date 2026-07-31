import { IsIn, IsOptional, IsString } from "class-validator";

const LEVELS = ["division", "district", "upazila", "mouza"] as const;

/**
 * Shared by POST (create) and PATCH (update) — every field is optional
 * here even though `reviewDraft()` requires them, because PATCH fills gaps
 * from the existing row before the draft ever reaches the gate. POST fills
 * gaps with reviewDraft()'s own defaults (empty string, "mouza"), the same
 * way the mock does, so an incomplete create is refused by the rule and
 * worded by its own error code — not by a DTO rejecting the request before
 * the rule gets a say.
 */
export class JurisdictionDraftDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nameBn?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsIn(LEVELS)
  level?: (typeof LEVELS)[number];

  /** Absent (undefined) vs explicit null differ on PATCH — clearing the parent. */
  @IsOptional()
  parentId?: string | null;
}

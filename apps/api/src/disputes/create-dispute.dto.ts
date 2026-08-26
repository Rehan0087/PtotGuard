import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const TYPES = ["boundary", "ownership", "inheritance", "encroachment", "fraud", "easement"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;

export class CreateDisputeDto {
  @IsString()
  parcelId!: string;

  @IsIn(TYPES)
  type!: (typeof TYPES)[number];

  @IsIn(PRIORITIES)
  priority!: (typeof PRIORITIES)[number];

  // Same bounds as the wizard's own zod schema (app/(app)/disputes/new) —
  // enforced here too, not just by a disabled button.
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  respondentName?: string;
}

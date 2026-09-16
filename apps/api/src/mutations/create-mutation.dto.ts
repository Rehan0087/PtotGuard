import { IsArray, IsIn, IsObject, IsOptional, IsString } from "class-validator";

const TYPES = ["sale", "inheritance", "gift", "partition", "correction"] as const;
const PAYMENT_METHODS = ["bkash", "nagad", "card"] as const;

export class CreateMutationDto {
  @IsString()
  parcelId!: string;

  @IsIn(TYPES)
  type!: (typeof TYPES)[number];

  // A registered account, not a typed name — see MutationsController's own
  // note on why this can't be free text if approval is ever going to
  // actually move ownership.
  // Optional for "correction" type — no ownership change occurs.
  @IsOptional()
  @IsString()
  toOwnerId?: string;

  @IsOptional()
  @IsString()
  deedNumber?: string;

  /** ISO date string — the wizard sends a plain date, no time component matters. */
  @IsOptional()
  @IsString()
  deedDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];

  // Required, not optional: the wizard's flow is apply → pay → submit, so a
  // submission always carries how the fee was paid. A citizen who hasn't
  // reached the payment step hasn't reached submit either.
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: (typeof PAYMENT_METHODS)[number];

  /** Type-specific metadata: correctionReason, heirRelationship, partitionNote, etc. */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

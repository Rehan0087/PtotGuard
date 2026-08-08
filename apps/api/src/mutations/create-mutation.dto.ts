import { IsIn, IsOptional, IsString } from "class-validator";

const TYPES = ["sale", "inheritance", "gift", "partition", "correction"] as const;
const PAYMENT_METHODS = ["bkash", "nagad", "card"] as const;

export class CreateMutationDto {
  @IsString()
  parcelId!: string;

  @IsIn(TYPES)
  type!: (typeof TYPES)[number];

  @IsString()
  toOwnerName!: string;

  @IsOptional()
  @IsString()
  deedNumber?: string;

  /** ISO date string — the wizard sends a plain date, no time component matters. */
  @IsOptional()
  @IsString()
  deedDate?: string;

  @IsOptional()
  documentIds?: string[];

  // Required, not optional: the wizard's flow is apply → pay → submit, so a
  // submission always carries how the fee was paid. A citizen who hasn't
  // reached the payment step hasn't reached submit either.
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: (typeof PAYMENT_METHODS)[number];
}

import { IsIn, IsString } from "class-validator";

const PAYMENT_METHODS = ["bkash", "nagad", "card"] as const;

/**
 * Deliberately carries no amount. What is owed is recomputed server-side from
 * the registry and the policy — see LandTaxController.pay().
 */
export class PayLandTaxDto {
  @IsString()
  parcelId!: string;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: (typeof PAYMENT_METHODS)[number];
}

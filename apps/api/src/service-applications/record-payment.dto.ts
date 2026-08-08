import { IsIn } from "class-validator";

const PAYMENT_METHODS = ["bkash", "nagad", "card"] as const;

export class RecordPaymentDto {
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: (typeof PAYMENT_METHODS)[number];
}

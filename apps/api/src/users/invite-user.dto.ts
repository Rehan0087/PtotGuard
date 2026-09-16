import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";

const ROLES = ["citizen", "land-office", "field-agent", "mediator", "admin"] as const;

/**
 * Everything an account needs to exist. No password: the invitation carries a
 * generated one, returned to the administrator once, because this system has
 * no mail delivery to send it through — the same stand-in the OCR worker and
 * the payment gateway use.
 */
export class InviteUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsIn(ROLES)
  role!: (typeof ROLES)[number];

  @IsString()
  jurisdictionId!: string;

  @IsOptional()
  @IsString()
  title?: string;
}

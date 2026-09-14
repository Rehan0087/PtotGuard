import { Transform } from "class-transformer";
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @ValidateIf((_object, value) => value !== "")
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  currentAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  emergencyContact?: string;

  @IsOptional()
  @IsObject()
  profileDetails?: Record<string, string>;
}

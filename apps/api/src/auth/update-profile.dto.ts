import { Transform } from "class-transformer";
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { IsProfileImageSource } from "./profile-image-source";

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
  @IsProfileImageSource()
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

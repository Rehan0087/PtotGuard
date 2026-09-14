import { IsEmail, IsObject, IsOptional, IsString, Length } from "class-validator";
import { Transform } from "class-transformer";

const Trim = () => Transform(({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value,
);

export class UpdateProfileDto {
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @Trim()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @Length(7, 30)
  phone?: string;

  @IsOptional()
  @Trim()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsObject()
  profileDetails?: Record<string, string>;
}

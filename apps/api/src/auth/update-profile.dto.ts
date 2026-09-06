import { IsOptional, IsString, IsObject } from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsObject()
  profileDetails?: Record<string, string>;
}

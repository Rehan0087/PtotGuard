import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateInquiryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

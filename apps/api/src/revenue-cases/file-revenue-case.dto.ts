import { IsString, MinLength } from "class-validator";

/**
 * Revenue cases are filed by the land office against an unpaid holding.
 */
export class FileRevenueCaseDto {
  @IsString()
  parcelId!: string;

  @IsString()
  @MinLength(1)
  grounds!: string;
}

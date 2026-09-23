import { IsInt, IsString, Min, MinLength } from "class-validator";

export class CreateListingDto {
  @IsString()
  parcelId!: string;

  @IsInt()
  @Min(1)
  askingPriceBdt!: number;

  @IsString()
  @MinLength(1)
  description!: string;
}

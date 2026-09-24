import { IsString } from "class-validator";

export class NotifyLandTaxDto {
  @IsString()
  parcelId!: string;
}

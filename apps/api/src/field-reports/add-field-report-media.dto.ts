import { IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

// No real object storage in this phase — `url` is a stub the same way OCR
// and payments are, not a signed-upload reference. See the capture screen's
// own note (app/(app)/visits/[id]).
class PhotoDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

class GpsDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsNumber()
  accuracyMeters!: number;

  @IsOptional()
  @IsString()
  label?: string;
}

export class AddFieldReportMediaDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PhotoDto)
  photo?: PhotoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GpsDto)
  gps?: GpsDto;
}

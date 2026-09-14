import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

class SurveyGpsPointDto {
  @IsUUID()
  id!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsISO8601({ strict: true })
  recordedAt!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  accuracyMeters!: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  altitudeMeters?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  speedMetersPerSecond?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(359.999999999)
  headingDegrees?: number;
}

export class AppendSurveyPointsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SurveyGpsPointDto)
  points!: SurveyGpsPointDto[];
}

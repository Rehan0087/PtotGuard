import { IsArray, IsOptional, IsString } from "class-validator";

export class RecordSessionDto {
  @IsString()
  summary!: string;

  /** Party names as recorded, matched by normalised name in rulingGate(). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendees?: string[];
}

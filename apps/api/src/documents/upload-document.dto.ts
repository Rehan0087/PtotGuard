import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

const TYPES = [
  "title-deed",
  "sale-deed",
  "mutation-order",
  "survey-report",
  "id-proof",
  "tax-receipt",
  "inheritance-affidavit",
  "court-order",
  "photo",
] as const;

export class UploadDocumentDto {
  @IsIn(TYPES)
  type!: (typeof TYPES)[number];

  @IsString()
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  // Optional: an id-proof or affidavit isn't always about one specific plot.
  @IsOptional()
  @IsString()
  parcelId?: string;
}

import { IsObject } from "class-validator";

export class UpdateDocumentFieldsDto {
  // Keyed by REQUIRED_FIELDS' own field names — an open map, same as
  // LandDocument.extractedFields itself; validated by extractionReview()
  // reading it, not by shape here.
  @IsObject()
  fields!: Record<string, string>;
}

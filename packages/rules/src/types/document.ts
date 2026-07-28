import type { ID, ISODateString } from "./common";

export type DocumentType =
  | "title-deed"
  | "sale-deed"
  | "mutation-order"
  | "survey-report"
  | "id-proof"
  | "tax-receipt"
  | "inheritance-affidavit"
  | "court-order"
  | "photo";

export type OcrStatus = "pending" | "processing" | "extracted" | "failed";

export type VerificationStatus =
  | "unverified"
  | "verified"
  | "flagged"
  | "rejected";

/**
 * A scanned/uploaded record. Named LandDocument to avoid clashing with the
 * DOM `Document` global.
 */
export interface LandDocument {
  id: ID;
  parcelId?: ID;
  ownerId?: ID;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount?: number;
  uploadedAt: ISODateString;
  uploadedById: ID;
  ocrStatus: OcrStatus;
  verificationStatus: VerificationStatus;
  /** 0..1, higher = more suspicious. Surfaced in the fraud-review queue. */
  fraudScore?: number;
  /** Key/value pairs pulled by OCR, e.g. { "Plot No": "142/3-B" }. */
  extractedFields?: Record<string, string>;
  thumbnailUrl?: string;
}

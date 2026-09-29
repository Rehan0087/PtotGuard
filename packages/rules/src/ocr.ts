/**
 * Digitisation rules for a scanned document. Pure — the backend enforces the
 * same checks before an extraction is written to the register, so this sits
 * alongside lib/inheritance.ts and lib/mutations.ts as a shared-package
 * candidate. The OCR queue uses it to explain a hold, never as the only thing
 * standing between a scan and the record.
 */
import type { DocumentType, LandDocument, Parcel } from "./types";

/**
 * What a usable extraction of each document type has to yield. These are the
 * fields a clerk would otherwise copy off the paper by hand — if the reader
 * misses one, someone has to key it in before the record moves.
 */
export const REQUIRED_FIELDS: Record<DocumentType, string[]> = {
  "title-deed": ["Dag No", "Khatian", "Owner"],
  "sale-deed": ["Dag No", "Khatian", "Stamp Value"],
  "mutation-order": ["Dag No", "Khatian", "Order No"],
  "survey-report": ["Dag No", "Area"],
  "inheritance-affidavit": ["Dag No", "Deceased"],
  "court-order": ["Case No", "Dag No"],
  "tax-receipt": ["Khatian", "Amount"],
  "id-proof": ["Name"],
  photo: [],
};

/**
 * Extracted values that must agree with the register when the document is
 * filed against a parcel. A contradiction here is not a typo to fix — it means
 * the scan and the record disagree about which land this is.
 */
const REGISTER_FIELDS: { field: string; of: (p: Parcel) => string }[] = [
  { field: "Dag No", of: (p) => p.dagNo },
  { field: "Khatian", of: (p) => p.khatianNo },
];

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/**
 * An issue carries the field and the values, never a sentence: the officer-facing
 * wording is looked up per locale in the UI (`t.ocr.issue`). Field names are the
 * *keys* of `extractedFields` — data, shared with the reader and the backend — so
 * they stay in English here and are labelled for display via `t.fields`.
 */
export type ExtractionIssue =
  | { kind: "mismatch"; field: string; scanned: string; registered: string }
  | { kind: "missing"; field: string };

/** Why acceptance is held. See the note on ExtractionIssue. */
export type ExtractionHold =
  | { code: "in-flight" }
  | { code: "failed" }
  | { code: "mismatch"; fields: string[] }
  | { code: "missing"; count: number };

export interface ExtractionReview {
  /** Where the scan sits in the pipeline, in officer terms. */
  stage: "in-flight" | "failed" | "ready";
  issues: ExtractionIssue[];
  /** Required fields the reader did not produce — the officer keys these. */
  missingFields: string[];
  /** Required fields present, over the number required. Drives the progress read. */
  fieldsFound: number;
  fieldsRequired: number;
  canAccept: boolean;
  /** A value contradicts the register — this belongs in fraud review, not the record. */
  mustEscalate: boolean;
  /** Reason acceptance is held. null when nothing blocks it. */
  hold: ExtractionHold | null;
}

/**
 * @param keyed Values the officer has typed but not yet saved, so the gate
 *   responds to keystrokes rather than only to what the reader returned.
 */
export function extractionReview(
  doc: LandDocument,
  parcel?: Parcel,
  keyed: Record<string, string> = {},
): ExtractionReview {
  const required = REQUIRED_FIELDS[doc.type] ?? [];
  const base = {
    issues: [] as ExtractionIssue[],
    missingFields: [] as string[],
    fieldsFound: 0,
    fieldsRequired: required.length,
    canAccept: false,
    mustEscalate: false,
  };

  if (doc.ocrStatus === "pending" || doc.ocrStatus === "processing") {
    return { ...base, stage: "in-flight", hold: { code: "in-flight" } };
  }

  if (doc.ocrStatus === "failed") {
    return { ...base, stage: "failed", hold: { code: "failed" } };
  }

  // Officer-typed values win over whatever the reader produced for that field.
  const fields: Record<string, string> = { ...doc.extractedFields };
  for (const [k, v] of Object.entries(keyed)) {
    if (v.trim()) fields[k] = v.trim();
  }

  const missingFields = required.filter((f) => !fields[f]?.trim());
  const mismatches = parcel
    ? REGISTER_FIELDS.filter(({ field, of }) => {
        const read = fields[field]?.trim();
        return Boolean(read) && normalise(read!) !== normalise(of(parcel));
      })
    : [];

  const issues: ExtractionIssue[] = [
    ...mismatches.map(({ field, of }) => ({
      kind: "mismatch" as const,
      field,
      scanned: fields[field]!,
      registered: of(parcel!),
    })),
    ...missingFields.map((field) => ({ kind: "missing" as const, field })),
  ];

  const shared = {
    stage: "ready" as const,
    issues,
    missingFields,
    fieldsFound: required.length - missingFields.length,
    fieldsRequired: required.length,
  };

  // A contradiction outranks a gap: keying the missing fields would not make
  // this safe to accept, so the escalation path is the only way forward.
  if (mismatches.length > 0) {
    return {
      ...shared,
      canAccept: false,
      mustEscalate: true,
      hold: { code: "mismatch", fields: mismatches.map((m) => m.field) },
    };
  }

  if (missingFields.length > 0) {
    return {
      ...shared,
      canAccept: false,
      mustEscalate: false,
      hold: { code: "missing", count: missingFields.length },
    };
  }

  return { ...shared, canAccept: true, mustEscalate: false, hold: null };
}

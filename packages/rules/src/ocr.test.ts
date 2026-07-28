import { describe, expect, it } from "vitest";
import { REQUIRED_FIELDS, extractionReview } from "./ocr";
import type { DocumentType, LandDocument, OcrStatus, Parcel } from "./types";

function doc(over: Partial<LandDocument> = {}): LandDocument {
  return {
    id: "d-1",
    parcelId: "p-1",
    type: "title-deed",
    fileName: "khatian-142-512.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    uploadedAt: "2026-07-18T11:20:00Z",
    uploadedById: "usr-1",
    ocrStatus: "extracted",
    verificationStatus: "unverified",
    ...over,
  };
}

/** A title deed the reader got completely right, against PARCEL below. */
function readCleanly(over: Partial<LandDocument> = {}): LandDocument {
  return doc({
    extractedFields: { "Dag No": "CS-142/3", Khatian: "512", Owner: "Aleya Begum" },
    ...over,
  });
}

const PARCEL = {
  id: "p-1",
  dagNo: "CS-142/3",
  khatianNo: "512",
} as Parcel;

describe("extractionReview — pipeline stage", () => {
  it.each(["pending", "processing"] as const)(
    "holds a %s scan without judging its fields",
    (ocrStatus) => {
      const review = extractionReview(doc({ ocrStatus }), PARCEL);

      expect(review.stage).toBe("in-flight");
      expect(review.hold).toEqual({ code: "in-flight" });
      expect(review.canAccept).toBe(false);
    },
  );

  it("holds a failed read as failed, not as missing fields", () => {
    // "The reader gave up" and "the reader missed three fields" are different
    // problems with different fixes — a re-scan versus keying them in.
    const review = extractionReview(doc({ ocrStatus: "failed" }), PARCEL);

    expect(review.stage).toBe("failed");
    expect(review.hold).toEqual({ code: "failed" });
  });

  it("reaches the officer once the read is done", () => {
    expect(extractionReview(readCleanly(), PARCEL).stage).toBe("ready");
  });
});

describe("extractionReview — required fields", () => {
  it("accepts a clean read that agrees with the register", () => {
    const review = extractionReview(readCleanly(), PARCEL);

    expect(review.canAccept).toBe(true);
    expect(review.hold).toBeNull();
    expect(review.mustEscalate).toBe(false);
  });

  it("names what the reader missed and counts it", () => {
    const review = extractionReview(
      doc({ extractedFields: { "Dag No": "CS-142/3" } }),
      PARCEL,
    );

    expect(review.missingFields).toEqual(["Khatian", "Owner"]);
    expect(review.hold).toEqual({ code: "missing", count: 2 });
  });

  it("reports progress over what this document type requires", () => {
    const review = extractionReview(
      doc({ extractedFields: { "Dag No": "CS-142/3" } }),
      PARCEL,
    );

    expect(review.fieldsFound).toBe(1);
    expect(review.fieldsRequired).toBe(3);
  });

  it("treats a blank extracted value as missing", () => {
    const review = extractionReview(
      doc({ extractedFields: { "Dag No": "CS-142/3", Khatian: "   ", Owner: "" } }),
      PARCEL,
    );

    expect(review.missingFields).toEqual(["Khatian", "Owner"]);
  });

  it("requires different fields of different document types", () => {
    const receipt = doc({ type: "tax-receipt", extractedFields: { Khatian: "512" } });

    // A tax receipt needs an amount; it does not need an owner name.
    expect(extractionReview(receipt, PARCEL).missingFields).toEqual(["Amount"]);
  });

  it("accepts a photo, which has nothing to yield", () => {
    const review = extractionReview(doc({ type: "photo", extractedFields: {} }), PARCEL);

    expect(review.canAccept).toBe(true);
    expect(review.fieldsRequired).toBe(0);
  });

  it("covers every document type", () => {
    // A type with no entry would read as requiring nothing and accept blindly.
    const types: DocumentType[] = [
      "title-deed",
      "sale-deed",
      "mutation-order",
      "survey-report",
      "id-proof",
      "tax-receipt",
      "inheritance-affidavit",
      "court-order",
      "photo",
    ];

    for (const t of types) expect(REQUIRED_FIELDS[t]).toBeDefined();
  });
});

describe("extractionReview — the digitisation station", () => {
  it("opens the gate as the officer keys a missing field in", () => {
    // The gate takes unsaved values so it reacts to typing, not only to saves.
    const partial = doc({ extractedFields: { "Dag No": "CS-142/3", Khatian: "512" } });

    expect(extractionReview(partial, PARCEL).canAccept).toBe(false);
    expect(extractionReview(partial, PARCEL, { Owner: "Aleya Begum" }).canAccept).toBe(true);
  });

  it("lets a keyed value win over what the reader produced", () => {
    const misread = readCleanly({
      extractedFields: { "Dag No": "CS-142/3", Khatian: "512", Owner: "Al3ya 8egum" },
    });
    const review = extractionReview(misread, PARCEL, { Owner: "Aleya Begum" });

    expect(review.canAccept).toBe(true);
  });

  it("ignores a keyed value that is only whitespace", () => {
    const partial = doc({ extractedFields: { "Dag No": "CS-142/3", Khatian: "512" } });
    const review = extractionReview(partial, PARCEL, { Owner: "   " });

    expect(review.canAccept).toBe(false);
    expect(review.missingFields).toEqual(["Owner"]);
  });

  it("can key a value into a contradiction as easily as out of one", () => {
    const partial = doc({ extractedFields: { Khatian: "512", Owner: "Aleya Begum" } });
    const review = extractionReview(partial, PARCEL, { "Dag No": "CS-999" });

    expect(review.mustEscalate).toBe(true);
  });
});

describe("extractionReview — disagreement with the register", () => {
  it("escalates rather than accepts when the scan names another plot", () => {
    const wrongPlot = readCleanly({
      extractedFields: { "Dag No": "CS-999", Khatian: "512", Owner: "Aleya Begum" },
    });
    const review = extractionReview(wrongPlot, PARCEL);

    expect(review.canAccept).toBe(false);
    expect(review.mustEscalate).toBe(true);
    expect(review.hold).toEqual({ code: "mismatch", fields: ["Dag No"] });
  });

  it("carries both values, so the officer sees what disagrees with what", () => {
    const wrongPlot = readCleanly({
      extractedFields: { "Dag No": "CS-999", Khatian: "512", Owner: "Aleya Begum" },
    });
    const review = extractionReview(wrongPlot, PARCEL);

    expect(review.issues).toContainEqual({
      kind: "mismatch",
      field: "Dag No",
      scanned: "CS-999",
      registered: "CS-142/3",
    });
  });

  it("lets a contradiction outrank a gap", () => {
    // Keying the missing fields in would not make this safe to accept, so the
    // escalation path is the only way forward.
    const wrongAndIncomplete = doc({ extractedFields: { "Dag No": "CS-999" } });
    const review = extractionReview(wrongAndIncomplete, PARCEL);

    expect(review.hold).toEqual({ code: "mismatch", fields: ["Dag No"] });
    expect(review.mustEscalate).toBe(true);
    // The gaps are still reported — they are just not what blocks it.
    expect(review.missingFields).toEqual(["Khatian", "Owner"]);
  });

  it("reports every field that disagrees, not just the first", () => {
    const bothWrong = readCleanly({
      extractedFields: { "Dag No": "CS-999", Khatian: "888", Owner: "Aleya Begum" },
    });

    expect(extractionReview(bothWrong, PARCEL).hold).toEqual({
      code: "mismatch",
      fields: ["Dag No", "Khatian"],
    });
  });

  it("does not call a field it never read a contradiction", () => {
    // An absent dag is a gap to key in, not a scan naming the wrong plot.
    const review = extractionReview(
      doc({ extractedFields: { Khatian: "512", Owner: "Aleya Begum" } }),
      PARCEL,
    );

    expect(review.mustEscalate).toBe(false);
    expect(review.hold).toEqual({ code: "missing", count: 1 });
  });

  it("matches the register through spacing and case", () => {
    // "cs-142/3" off a scan is the same plot as "CS-142/3" on the record.
    const spaced = readCleanly({
      extractedFields: { "Dag No": " cs-142 /3 ", Khatian: "512", Owner: "Aleya Begum" },
    });

    expect(extractionReview(spaced, PARCEL).mustEscalate).toBe(false);
  });

  it("cannot check the register for a document filed against no parcel", () => {
    const review = extractionReview(readCleanly({ parcelId: undefined }), undefined);

    expect(review.mustEscalate).toBe(false);
    expect(review.canAccept).toBe(true);
  });
});

describe("extractionReview — issue ordering", () => {
  it("puts contradictions before gaps", () => {
    // The screen renders these in order; the thing that blocks acceptance
    // should not be below the things that merely need typing.
    const review = extractionReview(doc({ extractedFields: { "Dag No": "CS-999" } }), PARCEL);

    expect(review.issues[0].kind).toBe("mismatch");
    expect(review.issues.slice(1).every((i) => i.kind === "missing")).toBe(true);
  });
});

describe("extractionReview — an in-flight scan reports no findings yet", () => {
  it.each(["pending", "processing", "failed"] as const)(
    "returns empty issues for a %s scan",
    (ocrStatus: OcrStatus) => {
      const review = extractionReview(
        doc({ ocrStatus, extractedFields: { "Dag No": "CS-999" } }),
        PARCEL,
      );

      expect(review.issues).toEqual([]);
      expect(review.mustEscalate).toBe(false);
    },
  );
});

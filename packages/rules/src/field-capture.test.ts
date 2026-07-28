import { describe, expect, it } from "vitest";
import { EVIDENCE_REQUIRED, filingReview } from "./field-capture";
import type { FieldPhoto, FieldReport, FieldReportPurpose, GpsCapture } from "./types";

function gps(n: number): GpsCapture[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `g-${i}`,
    point: { lat: 23.5 + i / 1000, lng: 91 + i / 1000 },
    accuracyMeters: 3,
    capturedAt: "2026-07-01T05:00:00Z",
  }));
}

function photos(n: number): FieldPhoto[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ph-${i}`,
    url: "",
    capturedAt: "2026-07-01T05:00:00Z",
  }));
}

function report(over: Partial<FieldReport> = {}): FieldReport {
  return {
    id: "fr-1",
    parcelId: "p-1",
    parcelDagNo: "CS-1",
    purpose: "boundary-survey",
    status: "in-progress",
    assignedAgentId: "usr-agent",
    scheduledFor: "2026-07-01T04:00:00Z",
    gpsCaptures: [],
    photos: [],
    ...over,
  };
}

const NOTES = "Cultivation observed inside the recorded line.";

describe("filingReview", () => {
  it("files once the purpose's evidence and the findings are in", () => {
    const review = filingReview(report({ gpsCaptures: gps(2) }), NOTES);

    expect(review.canFile).toBe(true);
    expect(review.blockers).toEqual([]);
  });

  it("wants two points for a boundary survey, because a line has two ends", () => {
    const review = filingReview(report({ gpsCaptures: gps(1) }), NOTES);

    expect(review.canFile).toBe(false);
    expect(review.blockers).toContainEqual({ code: "need-gps", have: 1, need: 2 });
  });

  it("wants a photograph of an encroachment, not just coordinates", () => {
    const review = filingReview(
      report({ purpose: "encroachment-check", gpsCaptures: gps(1) }),
      NOTES,
    );

    expect(review.blockers).toContainEqual({ code: "need-photos", have: 0, need: 1 });
  });

  it("asks a possession check for a photo but no GPS", () => {
    const review = filingReview(
      report({ purpose: "possession-verify", photos: photos(1) }),
      NOTES,
    );

    expect(review.canFile).toBe(true);
  });

  it("requires findings on every purpose", () => {
    // Points and pictures with no reading of them is data nobody can act on.
    const review = filingReview(report({ gpsCaptures: gps(2) }), "   ");

    expect(review.canFile).toBe(false);
    expect(review.blockers).toEqual([{ code: "need-notes" }]);
  });

  it("reacts to unsaved notes rather than only what is stored", () => {
    const stored = report({ gpsCaptures: gps(2), notes: "" });

    expect(filingReview(stored, "typed just now").canFile).toBe(true);
  });

  it("reports every outstanding requirement at once", () => {
    // An agent on site wants the whole remaining checklist, not one prompt at a time.
    const review = filingReview(report({ purpose: "encroachment-check" }), "");

    expect(review.blockers).toEqual([
      { code: "need-gps", have: 0, need: 1 },
      { code: "need-photos", have: 0, need: 1 },
      { code: "need-notes" },
    ]);
  });

  it.each(["completed", "cancelled"] as const)("refuses to add to a %s report", (status) => {
    const review = filingReview(report({ status, gpsCaptures: gps(2) }), NOTES);

    expect(review.canFile).toBe(false);
    expect(review.blockers).toContainEqual({ code: "not-actionable" });
  });

  it("does not count surplus evidence as a shortfall", () => {
    // A boundary survey needs no photos; having some is not a deficiency.
    const review = filingReview(report({ gpsCaptures: gps(3), photos: photos(2) }), NOTES);

    expect(review.canFile).toBe(true);
    expect(review.photosNeed).toBe(0);
    expect(review.photosHave).toBe(2);
  });

  it("covers every survey purpose", () => {
    // A new purpose without an entry would read as requiring nothing at all.
    const purposes: FieldReportPurpose[] = [
      "boundary-survey",
      "encroachment-check",
      "possession-verify",
      "measurement",
    ];

    for (const p of purposes) expect(EVIDENCE_REQUIRED[p]).toBeDefined();
  });
});

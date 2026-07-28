/**
 * Filing rules for a field survey. Pure — the backend enforces the same checks
 * before a report is attached to a dispute or a mutation, so this sits alongside
 * lib/ocr.ts and lib/mutations.ts as a shared-package candidate. The capture
 * screen uses it to explain why a report can't be filed yet, never as the only
 * thing standing between an agent and the record.
 *
 * The principle: a survey is evidence. What counts as evidence depends on what
 * the agent was sent to establish — a boundary needs points on the ground, an
 * encroachment needs a picture of it — so the requirement is per purpose, not
 * one blanket rule.
 */
import type { FieldReport, FieldReportPurpose } from "./types";

/**
 * What each survey has to come back with. `gps` is a count because a line needs
 * two ends: one point locates you, two describe a boundary.
 */
export const EVIDENCE_REQUIRED: Record<
  FieldReportPurpose,
  { gps: number; photos: number }
> = {
  "boundary-survey": { gps: 2, photos: 0 },
  measurement: { gps: 2, photos: 0 },
  "encroachment-check": { gps: 1, photos: 1 },
  "possession-verify": { gps: 0, photos: 1 },
};

/** Why filing is held. Codes plus the numbers the sentence needs — never a sentence. */
export type FilingBlocker =
  | { code: "not-actionable" }
  | { code: "need-gps"; have: number; need: number }
  | { code: "need-photos"; have: number; need: number }
  | { code: "need-notes" };

export interface FilingReview {
  /** Evidence gathered so far, over what this purpose requires. Drives the progress read. */
  gpsHave: number;
  gpsNeed: number;
  photosHave: number;
  photosNeed: number;
  hasNotes: boolean;
  canFile: boolean;
  /** Every reason filing is held, so the screen lists them rather than showing one at a time. */
  blockers: FilingBlocker[];
}

/**
 * @param notes The agent's unsaved draft, so the gate reacts as they type rather
 *   than only to what has already been written to the report.
 */
export function filingReview(report: FieldReport, notes: string): FilingReview {
  const need = EVIDENCE_REQUIRED[report.purpose];
  const gpsHave = report.gpsCaptures.length;
  const photosHave = report.photos.length;
  const hasNotes = notes.trim().length > 0;

  const blockers: FilingBlocker[] = [];

  // A report already filed or called off is not a draft to add to.
  if (report.status === "completed" || report.status === "cancelled") {
    blockers.push({ code: "not-actionable" });
  }
  if (gpsHave < need.gps) {
    blockers.push({ code: "need-gps", have: gpsHave, need: need.gps });
  }
  if (photosHave < need.photos) {
    blockers.push({ code: "need-photos", have: photosHave, need: need.photos });
  }
  // The finding is the deliverable: points and pictures without a reading of them
  // is data nobody downstream can act on.
  if (!hasNotes) {
    blockers.push({ code: "need-notes" });
  }

  return {
    gpsHave,
    gpsNeed: need.gps,
    photosHave,
    photosNeed: need.photos,
    hasNotes,
    canFile: blockers.length === 0,
    blockers,
  };
}

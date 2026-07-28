/**
 * Ruling rules for a mediated case. Pure — the backend enforces the same checks
 * before a ruling is written to the record, so this sits alongside
 * lib/mutations.ts and lib/field-capture.ts as a shared-package candidate. The
 * case screen uses it to explain why a ruling can't be entered yet, never as the
 * only thing standing between a mediator and the record.
 *
 * The rule that matters here is older than the software: a case is not decided
 * against someone who was never heard. A mediator can hold as many sessions as
 * they like, but until every named party has sat in one of them, there is no
 * ruling to enter — only a decision taken in someone's absence.
 */
import type { Dispute, Hearing } from "./types";

/**
 * Cases referred to mediation that nobody has listed for hearing yet — the
 * mediator's inbound queue, in the same shape as `disputesNeedingSurvey()`.
 *
 * Referral is the officer's decision, not the mediator's, so this deliberately
 * only picks up disputes already moved to `in-mediation`. A case still under
 * review belongs to the land office, however obviously contested it looks.
 */
export function disputesNeedingHearing(
  disputes: Dispute[],
  hearings: Hearing[],
): Dispute[] {
  const listed = new Set(hearings.map((h) => h.disputeId));
  return disputes.filter((d) => d.status === "in-mediation" && !listed.has(d.id));
}

/** Attendee lists are typed by hand, so match on shape rather than exact string. */
const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Why a ruling is held. Codes plus the names the sentence needs — never a sentence. */
export type RulingBlocker =
  | { code: "already-decided" }
  | { code: "no-sessions" }
  | { code: "unheard"; parties: string[] }
  | { code: "need-ruling" };

export interface RulingReview {
  sessionCount: number;
  /** Named parties who have attended at least one session. */
  heard: string[];
  /** Named parties who have not. Blocks the ruling — see the note above. */
  unheard: string[];
  canRule: boolean;
  /** Every reason at once, so the screen lists them rather than revealing one at a time. */
  blockers: RulingBlocker[];
}

/**
 * @param draftRuling The mediator's unsaved text, so the gate reacts as they
 *   type rather than only to what has already been written to the case.
 */
export function rulingGate(hearing: Hearing, draftRuling: string): RulingReview {
  const attended = new Set(
    hearing.sessions.flatMap((s) => s.attendees.map(normalise)),
  );
  const heard = hearing.parties.filter((p) => attended.has(normalise(p)));
  const unheard = hearing.parties.filter((p) => !attended.has(normalise(p)));

  const base = {
    sessionCount: hearing.sessions.length,
    heard,
    unheard,
  };

  // A decided case is not a draft. Listing what else is missing would imply
  // there is still something to do here.
  if (hearing.status === "ruled" || hearing.status === "appealed") {
    return { ...base, canRule: false, blockers: [{ code: "already-decided" }] };
  }

  const blockers: RulingBlocker[] = [];

  if (hearing.sessions.length === 0) {
    blockers.push({ code: "no-sessions" });
  } else if (unheard.length > 0) {
    // Only worth saying once sessions exist: with none, "nobody has been heard"
    // is the same fact stated twice.
    blockers.push({ code: "unheard", parties: unheard });
  }

  if (!draftRuling.trim()) {
    blockers.push({ code: "need-ruling" });
  }

  return { ...base, canRule: blockers.length === 0, blockers };
}

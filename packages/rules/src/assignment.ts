/**
 * Who can be sent to survey a given parcel. Pure — the backend enforces the
 * same constraints, so this belongs with lib/inheritance.ts, lib/mutations.ts,
 * and lib/ocr.ts. The board uses it to rank and to explain, never as the only
 * thing standing between a job and an agent.
 */
import type {
  Dispute,
  DisputeType,
  FieldReport,
  FieldReportPurpose,
  FieldReportStatus,
  Jurisdiction,
  Parcel,
  User,
  UserStatus,
} from "./types";

/** A visit that has been given out but not yet closed. */
export const OPEN_VISIT_STATUSES: FieldReportStatus[] = [
  "assigned",
  "en-route",
  "in-progress",
];

export function isOpenVisit(report: FieldReport): boolean {
  return OPEN_VISIT_STATUSES.includes(report.status);
}

/** Past this many open visits an agent is carrying more than a working day. */
export const COMFORTABLE_LOAD = 3;

/**
 * Does `agentJurisdictionId` cover `parcelJurisdictionId`? True when they are
 * the same, or when the agent sits above the parcel in the upazila/mouza tree —
 * a district survey officer covers every mouza beneath them.
 */
export function covers(
  agentJurisdictionId: string,
  parcelJurisdictionId: string,
  jurisdictions: Jurisdiction[],
): boolean {
  const byId = new Map(jurisdictions.map((j) => [j.id, j]));
  let cursor: string | null | undefined = parcelJurisdictionId;
  // Bounded by the tree depth; the guard is against a malformed parentId cycle.
  for (let hops = 0; cursor && hops <= jurisdictions.length; hops++) {
    if (cursor === agentJurisdictionId) return true;
    cursor = byId.get(cursor)?.parentId;
  }
  return false;
}

/** The survey a dispute of this kind actually calls for. */
export const PURPOSE_FOR_DISPUTE: Record<DisputeType, FieldReportPurpose> = {
  boundary: "boundary-survey",
  encroachment: "encroachment-check",
  ownership: "possession-verify",
  fraud: "possession-verify",
  inheritance: "measurement",
  easement: "boundary-survey",
};

const CLOSED_DISPUTE_STATUSES = new Set(["resolved", "rejected", "withdrawn"]);

/**
 * Open disputes with nobody booked to go and look. A cancelled visit doesn't
 * count as covered — the job is back on the board.
 */
export function disputesNeedingSurvey(
  disputes: Dispute[],
  reports: FieldReport[],
): Dispute[] {
  const covered = new Set(
    reports
      .filter((r) => r.disputeId && r.status !== "cancelled")
      .map((r) => r.disputeId),
  );
  return disputes.filter(
    (d) => !CLOSED_DISPUTE_STATUSES.has(d.status) && !covered.has(d.id),
  );
}

/**
 * Why an agent cannot take the job, as a code. Worded in the UI
 * (`t.pages.agents.blocker`).
 *
 * Areas are carried as jurisdiction **ids**, not names: a jurisdiction's
 * displayed name depends on the reader (`nameBn` in Bangla), so resolving it
 * here would bake one language into the rule.
 */
export type CandidateBlocker =
  | { code: "inactive"; status: UserStatus }
  | { code: "outside-area"; agentAreaId: string; parcelAreaId: string };

/** Worth knowing but not disqualifying. Worded in the UI (`t.pages.agents.note`). */
export type CandidateNote =
  | { code: "heavy-load"; openVisits: number }
  | { code: "same-parcel" }
  | { code: "outside-area"; agentAreaId: string; parcelAreaId: string };

export interface AgentCandidate {
  agent: User;
  openVisits: number;
  /** Blocking reason, or null when this agent can take the job as-is. */
  blocker: CandidateBlocker | null;
  /** Worth knowing but not disqualifying — load, jurisdiction overrides. */
  notes: CandidateNote[];
  /**
   * An open visit this agent already has on the same parcel. Assigning them
   * means one trip instead of two, so it ranks them first.
   */
  sameParcelVisit: FieldReport | null;
  /** True when the only thing in the way is the jurisdiction boundary. */
  needsJurisdictionOverride: boolean;
}

/**
 * Rank the field agents for a parcel: the ones who can go, best first.
 *
 * @param allowOutsideJurisdiction the officer has explicitly accepted sending
 *   someone outside their area — offices do this when short-staffed, but it is
 *   a deliberate act, not a default.
 */
export function rankCandidates(
  parcel: Parcel | undefined,
  agents: User[],
  reports: FieldReport[],
  jurisdictions: Jurisdiction[],
  allowOutsideJurisdiction = false,
): AgentCandidate[] {
  const candidates = agents.map((agent): AgentCandidate => {
    const open = reports.filter((r) => r.assignedAgentId === agent.id && isOpenVisit(r));
    const sameParcelVisit =
      parcel ? (open.find((r) => r.parcelId === parcel.id) ?? null) : null;

    const inArea =
      !parcel || covers(agent.jurisdictionId, parcel.jurisdictionId, jurisdictions);
    const notes: CandidateNote[] = [];

    if (agent.status !== "active") {
      return {
        agent,
        openVisits: open.length,
        blocker: { code: "inactive", status: agent.status },
        notes,
        sameParcelVisit,
        needsJurisdictionOverride: false,
      };
    }

    if (open.length > COMFORTABLE_LOAD) {
      notes.push({ code: "heavy-load", openVisits: open.length });
    }
    if (sameParcelVisit) {
      notes.push({ code: "same-parcel" });
    }

    if (!inArea) {
      const detail = {
        agentAreaId: agent.jurisdictionId,
        parcelAreaId: parcel!.jurisdictionId,
      };
      if (allowOutsideJurisdiction) {
        notes.push({ code: "outside-area", ...detail });
        return {
          agent,
          openVisits: open.length,
          blocker: null,
          notes,
          sameParcelVisit,
          needsJurisdictionOverride: true,
        };
      }
      return {
        agent,
        openVisits: open.length,
        blocker: { code: "outside-area", ...detail },
        notes,
        sameParcelVisit,
        needsJurisdictionOverride: true,
      };
    }

    return {
      agent,
      openVisits: open.length,
      blocker: null,
      notes,
      sameParcelVisit,
      needsJurisdictionOverride: false,
    };
  });

  return candidates.sort((a, b) => {
    if (!a.blocker !== !b.blocker) return a.blocker ? 1 : -1;
    // Someone already headed to this parcel saves a trip, so they lead.
    if (!a.sameParcelVisit !== !b.sameParcelVisit) return a.sameParcelVisit ? -1 : 1;
    if (a.needsJurisdictionOverride !== b.needsJurisdictionOverride) {
      return a.needsJurisdictionOverride ? 1 : -1;
    }
    if (a.openVisits !== b.openVisits) return a.openVisits - b.openVisits;
    return a.agent.name.localeCompare(b.agent.name);
  });
}

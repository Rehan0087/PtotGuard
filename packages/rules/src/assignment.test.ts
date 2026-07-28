import { describe, expect, it } from "vitest";
import {
  COMFORTABLE_LOAD,
  OPEN_VISIT_STATUSES,
  PURPOSE_FOR_DISPUTE,
  covers,
  disputesNeedingSurvey,
  isOpenVisit,
  rankCandidates,
} from "./assignment";
import type {
  Dispute,
  DisputeType,
  FieldReport,
  FieldReportStatus,
  Jurisdiction,
  Parcel,
  User,
  UserStatus,
} from "./types";

/** Chattogram › Cumilla › Debidwar › {Rajamehar, Payalgacha}, plus a second upazila. */
const JURISDICTIONS: Jurisdiction[] = [
  { id: "j-ctg", name: "Chattogram", code: "CTG", level: "division", parentId: null },
  { id: "j-cum", name: "Cumilla", code: "CTG-CUM", level: "district", parentId: "j-ctg" },
  { id: "j-deb", name: "Debidwar", code: "CTG-CUM-DEB", level: "upazila", parentId: "j-cum" },
  { id: "j-raj", name: "Rajamehar", code: "CTG-CUM-DEB-RAJ", level: "mouza", parentId: "j-deb" },
  { id: "j-pay", name: "Payalgacha", code: "CTG-CUM-DEB-PAY", level: "mouza", parentId: "j-deb" },
  { id: "j-mur", name: "Muradnagar", code: "CTG-CUM-MUR", level: "upazila", parentId: "j-cum" },
];

function agent(
  id: string,
  jurisdictionId: string,
  over: { name?: string; status?: UserStatus } = {},
): User {
  return {
    id,
    name: over.name ?? id,
    role: "field-agent",
    jurisdictionId,
    status: over.status ?? "active",
  } as User;
}

function visit(
  id: string,
  assignedAgentId: string,
  over: { parcelId?: string; status?: FieldReportStatus; disputeId?: string } = {},
): FieldReport {
  return {
    id,
    parcelId: over.parcelId ?? "p-other",
    parcelDagNo: "CS-1",
    disputeId: over.disputeId,
    purpose: "boundary-survey",
    status: over.status ?? "assigned",
    assignedAgentId,
    scheduledFor: "2026-07-20T04:00:00Z",
    gpsCaptures: [],
    photos: [],
  };
}

/** The parcel every ranking test sends someone to — in Rajamehar mouza. */
const PARCEL = { id: "p-1", jurisdictionId: "j-raj" } as Parcel;

function dispute(id: string, over: Partial<Dispute> = {}): Dispute {
  return {
    id,
    caseNumber: `DSP-${id}`,
    parcelId: "p-1",
    parcelDagNo: "CS-1",
    type: "boundary",
    status: "under-review",
    priority: "medium",
    filedById: "usr-1",
    filedByName: "Aleya Begum",
    filedAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    description: "…",
    parties: [],
    evidenceDocumentIds: [],
    ...over,
  };
}

describe("covers", () => {
  it("covers the agent's own area", () => {
    expect(covers("j-raj", "j-raj", JURISDICTIONS)).toBe(true);
  });

  it("lets a district officer reach every mouza beneath them", () => {
    expect(covers("j-cum", "j-raj", JURISDICTIONS)).toBe(true);
    expect(covers("j-ctg", "j-raj", JURISDICTIONS)).toBe(true);
  });

  it("does not let a mouza amin reach upward", () => {
    // Coverage runs down the tree, never up.
    expect(covers("j-raj", "j-cum", JURISDICTIONS)).toBe(false);
  });

  it("does not let a mouza amin reach sideways", () => {
    expect(covers("j-raj", "j-pay", JURISDICTIONS)).toBe(false);
  });

  it("does not cross into a sibling upazila's mouzas", () => {
    expect(covers("j-mur", "j-raj", JURISDICTIONS)).toBe(false);
  });

  it("terminates on a malformed parent cycle instead of walking forever", () => {
    const a: Jurisdiction = { id: "a", name: "A", code: "A", level: "upazila", parentId: "b" };
    const b: Jurisdiction = { id: "b", name: "B", code: "B", level: "mouza", parentId: "a" };

    expect(covers("nowhere", "a", [a, b])).toBe(false);
  });
});

describe("disputesNeedingSurvey", () => {
  it("puts an open dispute with nobody booked on the board", () => {
    expect(disputesNeedingSurvey([dispute("ds-1")], [])).toHaveLength(1);
  });

  it("takes it off once a visit is booked against it", () => {
    const booked = visit("fr-1", "a-1", { disputeId: "ds-1" });

    expect(disputesNeedingSurvey([dispute("ds-1")], [booked])).toEqual([]);
  });

  it("puts the job back when the visit is cancelled", () => {
    const cancelled = visit("fr-1", "a-1", { disputeId: "ds-1", status: "cancelled" });

    expect(disputesNeedingSurvey([dispute("ds-1")], [cancelled])).toHaveLength(1);
  });

  it("still counts a completed visit as covered", () => {
    // The land has been looked at; the job is done, not outstanding.
    const done = visit("fr-1", "a-1", { disputeId: "ds-1", status: "completed" });

    expect(disputesNeedingSurvey([dispute("ds-1")], [done])).toEqual([]);
  });

  it.each(["resolved", "rejected", "withdrawn"] as const)(
    "never asks for a survey on a %s dispute",
    (status) => {
      expect(disputesNeedingSurvey([dispute("ds-1", { status })], [])).toEqual([]);
    },
  );

  it("ignores a visit that belongs to no dispute", () => {
    // A mutation survey does not cover a dispute on the same parcel.
    const standalone = visit("fr-1", "a-1");

    expect(disputesNeedingSurvey([dispute("ds-1")], [standalone])).toHaveLength(1);
  });
});

describe("open visits", () => {
  it.each(OPEN_VISIT_STATUSES)("counts a %s visit as still out", (status) => {
    expect(isOpenVisit(visit("fr-1", "a-1", { status }))).toBe(true);
  });

  it.each(["completed", "cancelled"] as const)("counts a %s visit as closed", (status) => {
    expect(isOpenVisit(visit("fr-1", "a-1", { status }))).toBe(false);
  });
});

describe("rankCandidates — who is blocked", () => {
  it("clears an active agent in their own area", () => {
    const [c] = rankCandidates(PARCEL, [agent("a-1", "j-raj")], [], JURISDICTIONS);

    expect(c.blocker).toBeNull();
    expect(c.needsJurisdictionOverride).toBe(false);
  });

  it.each(["suspended", "invited"] as const)("refuses work to a %s account", (status) => {
    const [c] = rankCandidates(
      PARCEL,
      [agent("a-1", "j-raj", { status })],
      [],
      JURISDICTIONS,
    );

    expect(c.blocker).toEqual({ code: "inactive", status });
  });

  it("blocks a cross-boundary assignment by default", () => {
    // Real offices do this when short-staffed; it should be a decision, not an
    // accident.
    const [c] = rankCandidates(PARCEL, [agent("a-1", "j-pay")], [], JURISDICTIONS);

    expect(c.blocker).toEqual({
      code: "outside-area",
      agentAreaId: "j-pay",
      parcelAreaId: "j-raj",
    });
    expect(c.needsJurisdictionOverride).toBe(true);
  });

  it("carries areas as ids, never names, so the rule stays language-free", () => {
    const [c] = rankCandidates(PARCEL, [agent("a-1", "j-pay")], [], JURISDICTIONS);

    expect(c.blocker).toEqual(
      expect.objectContaining({ agentAreaId: "j-pay", parcelAreaId: "j-raj" }),
    );
  });

  it("unblocks a cross-boundary assignment once the officer ticks the override", () => {
    const [c] = rankCandidates(PARCEL, [agent("a-1", "j-pay")], [], JURISDICTIONS, true);

    expect(c.blocker).toBeNull();
    expect(c.needsJurisdictionOverride).toBe(true);
    expect(c.notes).toContainEqual({
      code: "outside-area",
      agentAreaId: "j-pay",
      parcelAreaId: "j-raj",
    });
  });

  it("keeps a suspended account blocked even with the override ticked", () => {
    // The override is about geography, not about who may be given work.
    const [c] = rankCandidates(
      PARCEL,
      [agent("a-1", "j-pay", { status: "suspended" })],
      [],
      JURISDICTIONS,
      true,
    );

    expect(c.blocker).toEqual({ code: "inactive", status: "suspended" });
  });
});

describe("rankCandidates — notes", () => {
  it("flags an agent carrying more than a working day", () => {
    const load = Array.from({ length: COMFORTABLE_LOAD + 1 }, (_, i) => visit(`fr-${i}`, "a-1"));
    const [c] = rankCandidates(PARCEL, [agent("a-1", "j-raj")], load, JURISDICTIONS);

    expect(c.notes).toContainEqual({ code: "heavy-load", openVisits: COMFORTABLE_LOAD + 1 });
  });

  it("does not flag an agent at exactly a comfortable load", () => {
    const load = Array.from({ length: COMFORTABLE_LOAD }, (_, i) => visit(`fr-${i}`, "a-1"));
    const [c] = rankCandidates(PARCEL, [agent("a-1", "j-raj")], load, JURISDICTIONS);

    expect(c.notes).toEqual([]);
  });

  it("counts only open visits toward the load", () => {
    const closed = [
      visit("fr-1", "a-1", { status: "completed" }),
      visit("fr-2", "a-1", { status: "cancelled" }),
    ];
    const [c] = rankCandidates(PARCEL, [agent("a-1", "j-raj")], closed, JURISDICTIONS);

    expect(c.openVisits).toBe(0);
  });

  it("notices an agent already going to this parcel", () => {
    const same = visit("fr-1", "a-1", { parcelId: PARCEL.id });
    const [c] = rankCandidates(PARCEL, [agent("a-1", "j-raj")], [same], JURISDICTIONS);

    expect(c.sameParcelVisit?.id).toBe("fr-1");
    expect(c.notes).toContainEqual({ code: "same-parcel" });
  });

  it("does not count a closed visit on this parcel as a trip already planned", () => {
    const done = visit("fr-1", "a-1", { parcelId: PARCEL.id, status: "completed" });
    const [c] = rankCandidates(PARCEL, [agent("a-1", "j-raj")], [done], JURISDICTIONS);

    expect(c.sameParcelVisit).toBeNull();
  });
});

describe("rankCandidates — order", () => {
  const rank = (
    agents: User[],
    reports: FieldReport[] = [],
    allowOutside = false,
  ): string[] =>
    rankCandidates(PARCEL, agents, reports, JURISDICTIONS, allowOutside).map((c) => c.agent.id);

  it("puts everyone who can go above everyone who cannot", () => {
    const agents = [
      agent("blocked", "j-raj", { status: "suspended" }),
      agent("free", "j-raj"),
    ];

    expect(rank(agents)).toEqual(["free", "blocked"]);
  });

  it("leads with whoever is already headed to this parcel", () => {
    // One trip covers both jobs — that is the cheapest assignment available.
    const agents = [agent("idle", "j-raj"), agent("going", "j-raj")];
    const reports = [visit("fr-1", "going", { parcelId: PARCEL.id })];

    expect(rank(agents, reports)).toEqual(["going", "idle"]);
  });

  it("prefers a same-parcel trip over a lighter caseload", () => {
    const agents = [agent("idle", "j-raj"), agent("busy", "j-raj")];
    const reports = [
      visit("fr-1", "busy", { parcelId: PARCEL.id }),
      visit("fr-2", "busy"),
      visit("fr-3", "busy"),
    ];

    expect(rank(agents, reports)).toEqual(["busy", "idle"]);
  });

  it("puts an in-area agent above one needing a boundary override", () => {
    const agents = [agent("outside", "j-pay"), agent("inside", "j-raj")];

    expect(rank(agents, [], true)).toEqual(["inside", "outside"]);
  });

  it("sorts by load once nothing else separates two agents", () => {
    const agents = [agent("heavier", "j-raj"), agent("lighter", "j-raj")];
    const reports = [visit("fr-1", "heavier"), visit("fr-2", "heavier")];

    expect(rank(agents, reports)).toEqual(["lighter", "heavier"]);
  });

  it("falls back to name so the board does not reshuffle between renders", () => {
    const agents = [
      agent("a-2", "j-raj", { name: "Zahir" }),
      agent("a-1", "j-raj", { name: "Amin" }),
    ];

    expect(rank(agents)).toEqual(["a-1", "a-2"]);
  });
});

describe("rankCandidates — no parcel chosen yet", () => {
  it("treats every active agent as available before a parcel is picked", () => {
    const [c] = rankCandidates(undefined, [agent("a-1", "j-mur")], [], JURISDICTIONS);

    expect(c.blocker).toBeNull();
    expect(c.needsJurisdictionOverride).toBe(false);
  });

  it("still refuses a suspended account", () => {
    const [c] = rankCandidates(
      undefined,
      [agent("a-1", "j-raj", { status: "suspended" })],
      [],
      JURISDICTIONS,
    );

    expect(c.blocker).toEqual({ code: "inactive", status: "suspended" });
  });
});

describe("PURPOSE_FOR_DISPUTE", () => {
  it("sends a boundary dispute for a boundary survey", () => {
    expect(PURPOSE_FOR_DISPUTE.boundary).toBe("boundary-survey");
  });

  it("sends a fraud case to verify who is actually in possession", () => {
    expect(PURPOSE_FOR_DISPUTE.fraud).toBe("possession-verify");
  });

  it("covers every dispute type", () => {
    // A type with no entry would preselect undefined on the booking board.
    const types: DisputeType[] = [
      "boundary",
      "ownership",
      "inheritance",
      "encroachment",
      "fraud",
      "easement",
    ];

    for (const t of types) expect(PURPOSE_FOR_DISPUTE[t]).toBeDefined();
  });
});

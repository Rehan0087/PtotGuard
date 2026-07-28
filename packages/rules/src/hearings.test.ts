import { describe, expect, it } from "vitest";
import { disputesNeedingHearing, rulingGate } from "./hearings";
import type { Dispute, Hearing, HearingSession } from "./types";

function session(attendees: string[]): HearingSession {
  return { id: `s-${attendees.join("-")}`, at: "2026-07-01T05:30:00Z", summary: "…", attendees };
}

function hearing(over: Partial<Hearing> = {}): Hearing {
  return {
    id: "h-1",
    caseNumber: "HRG-2026-0001",
    disputeId: "ds-1",
    parcelDagNo: "CS-1",
    mediatorId: "usr-mediator",
    status: "in-hearing",
    parties: ["Aleya Begum", "Sohel Rana"],
    sessions: [],
    ...over,
  };
}

const RULING = "Boundary to follow the surveyed line.";

describe("rulingGate", () => {
  it("holds a case where no sitting has been held", () => {
    const review = rulingGate(hearing(), RULING);

    expect(review.canRule).toBe(false);
    expect(review.blockers).toEqual([{ code: "no-sessions" }]);
  });

  it("does not also list every party as unheard when there are no sittings", () => {
    // Otherwise the mediator reads the same fact three times.
    const review = rulingGate(hearing(), RULING);

    expect(review.blockers.some((b) => b.code === "unheard")).toBe(false);
  });

  it("names the party who has not attended, and refuses", () => {
    const review = rulingGate(
      hearing({ sessions: [session(["Aleya Begum"])] }),
      RULING,
    );

    expect(review.canRule).toBe(false);
    expect(review.blockers).toContainEqual({ code: "unheard", parties: ["Sohel Rana"] });
    expect(review.heard).toEqual(["Aleya Begum"]);
    expect(review.unheard).toEqual(["Sohel Rana"]);
  });

  it("counts attendance across sittings, not within one", () => {
    // A party who came to the first hearing and missed the second has been
    // heard — otherwise a ruling is hostage to whoever declines to show up last.
    const review = rulingGate(
      hearing({ sessions: [session(["Aleya Begum"]), session(["Sohel Rana"])] }),
      RULING,
    );

    expect(review.canRule).toBe(true);
    expect(review.blockers).toEqual([]);
  });

  it("matches attendees whose names differ only in spacing or case", () => {
    const review = rulingGate(
      hearing({ sessions: [session(["aleya  begum", "SOHEL RANA"])] }),
      RULING,
    );

    expect(review.unheard).toEqual([]);
  });

  it("requires the ruling text itself", () => {
    const review = rulingGate(
      hearing({ sessions: [session(["Aleya Begum", "Sohel Rana"])] }),
      "   ",
    );

    expect(review.canRule).toBe(false);
    expect(review.blockers).toEqual([{ code: "need-ruling" }]);
  });

  it("reports every outstanding reason at once", () => {
    const review = rulingGate(hearing(), "");

    expect(review.blockers).toEqual([{ code: "no-sessions" }, { code: "need-ruling" }]);
  });

  it.each(["ruled", "appealed"] as const)(
    "treats a %s case as decided and says only that",
    (status) => {
      const review = rulingGate(hearing({ status, sessions: [] }), "");

      expect(review.canRule).toBe(false);
      // Not "hold a sitting" and "write the decision" — there is nothing to do.
      expect(review.blockers).toEqual([{ code: "already-decided" }]);
    },
  );

  it("ignores an attendee who is not a named party", () => {
    // The mediator attends every sitting; that is not a party being heard.
    const review = rulingGate(
      hearing({ sessions: [session(["Aleya Begum", "Shahida Khatun"])] }),
      RULING,
    );

    expect(review.unheard).toEqual(["Sohel Rana"]);
  });
});

function dispute(over: Partial<Dispute> = {}): Dispute {
  return {
    id: "ds-1",
    caseNumber: "DSP-2026-00001",
    parcelId: "p-1",
    parcelDagNo: "CS-1",
    type: "boundary",
    status: "in-mediation",
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

describe("disputesNeedingHearing", () => {
  it("lists a referred case with no hearing", () => {
    expect(disputesNeedingHearing([dispute()], [])).toHaveLength(1);
  });

  it("drops a case once any hearing exists for it", () => {
    expect(disputesNeedingHearing([dispute()], [hearing({ disputeId: "ds-1" })])).toEqual([]);
  });

  it("drops a case listed by a different mediator", () => {
    // The board is the office's, not one mediator's: a case a colleague listed
    // has been listed.
    const theirs = hearing({ disputeId: "ds-1", mediatorId: "usr-someone-else" });

    expect(disputesNeedingHearing([dispute()], [theirs])).toEqual([]);
  });

  it.each(["submitted", "under-review", "field-visit-scheduled"] as const)(
    "leaves a %s case with the land office",
    (status) => {
      // Referral is the officer's decision, not the mediator's.
      expect(disputesNeedingHearing([dispute({ status })], [])).toEqual([]);
    },
  );

  it.each(["resolved", "rejected", "withdrawn"] as const)(
    "never asks for a hearing on a %s case",
    (status) => {
      expect(disputesNeedingHearing([dispute({ status })], [])).toEqual([]);
    },
  );
});

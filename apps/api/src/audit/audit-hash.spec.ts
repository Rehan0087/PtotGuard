import { describe, expect, it } from "vitest";
import { canonicalize, computeHash, hashInput, verifyChain, type StoredAuditEvent } from "./audit-hash";

const EVENT = {
  entityType: "dispute",
  entityId: "ds-417",
  action: "status-change",
  actorId: "usr-officer",
  payload: { from: "submitted", to: "under-review" },
  createdAt: "2026-07-21T09:00:00.000Z",
};

/** A short, genuinely-chained ledger, the way appending it would build one. */
function chainOf(events: Omit<StoredAuditEvent, "prevHash" | "hash">[]): StoredAuditEvent[] {
  const chain: StoredAuditEvent[] = [];
  let prevHash = "";
  for (const e of events) {
    const hash = computeHash(prevHash, { ...e, createdAt: e.createdAt.toISOString() });
    chain.push({ ...e, prevHash, hash });
    prevHash = hash;
  }
  return chain;
}

const RAW_EVENTS: Omit<StoredAuditEvent, "prevHash" | "hash">[] = [
  {
    id: "au-1",
    entityType: "parcel",
    entityId: "p-142",
    action: "create",
    actorId: "usr-officer",
    payload: { dagNo: "CS-142/3" },
    createdAt: new Date("2026-07-15T10:30:00.000Z"),
  },
  {
    id: "au-2",
    entityType: "dispute",
    entityId: "ds-417",
    action: "status-change",
    actorId: "usr-officer",
    payload: { from: "submitted", to: "under-review" },
    createdAt: new Date("2026-07-21T09:00:00.000Z"),
  },
  {
    id: "au-3",
    entityType: "mutation",
    entityId: "m-1180",
    action: "approve",
    actorId: "usr-officer",
    payload: { toOwnerName: "Iqbal Enterprise" },
    createdAt: new Date("2026-06-30T10:00:00.000Z"),
  },
];

describe("canonicalize", () => {
  it("sorts object keys recursively", () => {
    const a = canonicalize({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalize({ a: { c: 3, d: 2 }, b: 1 });

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("leaves array order alone — position is meaningful, key order is not", () => {
    expect(canonicalize([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("passes primitives through untouched", () => {
    expect(canonicalize("x")).toBe("x");
    expect(canonicalize(5)).toBe(5);
    expect(canonicalize(null)).toBeNull();
  });
});

describe("hashInput / computeHash", () => {
  it("hashes the same regardless of the payload's key order", () => {
    // This is the whole reason canonicalize exists: Postgres jsonb does not
    // preserve insertion order, so a payload read back from the database must
    // hash identically to the one that was written, or every row breaks.
    const reordered = { ...EVENT, payload: { to: "under-review", from: "submitted" } };

    expect(computeHash("", EVENT)).toBe(computeHash("", reordered));
  });

  it("changes if the previous hash changes — that is what makes it a chain", () => {
    expect(computeHash("hash-a", EVENT)).not.toBe(computeHash("hash-b", EVENT));
  });

  it("changes if any field of the event changes", () => {
    const base = computeHash("", EVENT);

    expect(computeHash("", { ...EVENT, action: "approve" })).not.toBe(base);
    expect(computeHash("", { ...EVENT, actorId: "someone-else" })).not.toBe(base);
    expect(computeHash("", { ...EVENT, payload: { from: "submitted", to: "resolved" } })).not.toBe(
      base,
    );
    expect(computeHash("", { ...EVENT, createdAt: "2026-07-21T09:00:00.001Z" })).not.toBe(base);
  });

  it("is a pure function of its inputs — same event, same hash, every time", () => {
    expect(computeHash("", EVENT)).toBe(computeHash("", EVENT));
  });

  it("joins fields with a separator, so no field boundary is ambiguous", () => {
    // If fields were concatenated with no separator, entityId "ab" + action "c"
    // would hash the same as entityId "a" + action "bc". The separator, not
    // just the field values, is part of what is signed.
    expect(hashInput("", EVENT).split("|")).toHaveLength(7);
  });
});

describe("verifyChain", () => {
  it("passes a genuinely chained ledger", () => {
    const result = verifyChain(chainOf(RAW_EVENTS));

    expect(result).toEqual({ ok: true, checkedCount: 3 });
  });

  it("passes an empty ledger — nothing to break", () => {
    expect(verifyChain([])).toEqual({ ok: true, checkedCount: 0 });
  });

  it("catches a payload edited after the fact, naming which row and its position", () => {
    const chain = chainOf(RAW_EVENTS);
    chain[1] = { ...chain[1], payload: { from: "submitted", to: "resolved" } };

    expect(verifyChain(chain)).toEqual({ ok: false, checkedCount: 2, brokenAt: { id: "au-2", index: 1 } });
  });

  it("catches a row deleted from the middle — the next link's prevHash no longer matches", () => {
    const chain = chainOf(RAW_EVENTS);
    chain.splice(1, 1);

    expect(verifyChain(chain).ok).toBe(false);
    expect(verifyChain(chain).brokenAt?.id).toBe("au-3");
  });

  it("catches two rows swapped, even though every individual row is untouched", () => {
    // Same three events, wrong order — prevHash no longer lines up.
    const chain = chainOf(RAW_EVENTS);
    [chain[0], chain[1]] = [chain[1], chain[0]];

    expect(verifyChain(chain).ok).toBe(false);
  });

  it("stops at the first break rather than reporting every downstream row", () => {
    // Everything after a broken link necessarily fails too — checkedCount
    // reports where verification stopped, not how many rows disagree.
    const chain = chainOf(RAW_EVENTS);
    chain[0] = { ...chain[0], hash: "tampered" };

    expect(verifyChain(chain).checkedCount).toBe(1);
  });
});

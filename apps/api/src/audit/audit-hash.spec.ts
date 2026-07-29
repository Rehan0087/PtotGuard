import { describe, expect, it } from "vitest";
import { canonicalize, computeHash, hashInput } from "./audit-hash";

const EVENT = {
  entityType: "dispute",
  entityId: "ds-417",
  action: "status-change",
  actorId: "usr-officer",
  payload: { from: "submitted", to: "under-review" },
  createdAt: "2026-07-21T09:00:00.000Z",
};

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

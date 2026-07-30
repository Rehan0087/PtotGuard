import { createHash } from "node:crypto";

/**
 * Recursively sort object keys before serialising. Postgres `jsonb` does not
 * preserve insertion order, so hashing `JSON.stringify(payload)` after a
 * round trip through the database hashes a different string than the one
 * that was signed on write — `/audit/verify` would then report every row as
 * broken, not because anything was tampered with, but because the hash was
 * never reproducible in the first place. Sorting keys makes the string the
 * same regardless of what order Postgres happens to hand them back.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export interface AuditLinkInput {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  payload: unknown;
  /**
   * Already an ISO string, not a `Date` — a `Date` re-stringified after a
   * round trip through Postgres can differ in millisecond precision from
   * the string that was originally hashed. The caller owns picking one
   * representation and sticking to it; this function does not normalise it.
   */
  createdAt: string;
}

/** The exact string that gets hashed for one link in the chain. */
export function hashInput(prevHash: string, event: AuditLinkInput): string {
  return [
    prevHash,
    event.entityType,
    event.entityId,
    event.action,
    event.actorId,
    JSON.stringify(canonicalize(event.payload)),
    event.createdAt,
  ].join("|");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Compute the link hash for one event, given the hash it chains from. */
export function computeHash(prevHash: string, event: AuditLinkInput): string {
  return sha256Hex(hashInput(prevHash, event));
}

/** A ledger row as Prisma returns it — `createdAt` is a Date, not yet a string. */
export interface StoredAuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  payload: unknown;
  createdAt: Date;
  prevHash: string;
  hash: string;
}

export interface AuditVerifyResult {
  ok: boolean;
  checkedCount: number;
  /** The first event whose recomputed hash didn't match, if any. */
  brokenAt?: { id: string; index: number };
}

/**
 * Recompute every link and report the first break, if any. `events` must
 * already be in chain order (oldest first) — the same order they were
 * appended in, which is also createdAt ascending.
 */
export function verifyChain(events: StoredAuditEvent[]): AuditVerifyResult {
  let prevHash = "";
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const expected = computeHash(prevHash, {
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      actorId: e.actorId,
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    });
    if (e.prevHash !== prevHash || e.hash !== expected) {
      return { ok: false, checkedCount: i + 1, brokenAt: { id: e.id, index: i } };
    }
    prevHash = e.hash;
  }
  return { ok: true, checkedCount: events.length };
}

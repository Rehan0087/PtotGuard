/**
 * Builds and verifies the hash-chained audit ledger for the mock. Uses real
 * SHA-256 (Web Crypto) so GET /audit/verify actually walks the chain — the same
 * guarantee the backend enforces at the database level.
 */
import type { AuditEvent, AuditVerifyResult } from "@/lib/types";
import { auditSeed } from "./data";

type RawEvent = Omit<AuditEvent, "prevHash" | "hash">;

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashInput(prevHash: string, e: RawEvent): string {
  return [
    prevHash,
    e.entityType,
    e.entityId,
    e.action,
    e.actorId,
    JSON.stringify(e.payload),
    e.createdAt,
  ].join("|");
}

let chainCache: AuditEvent[] | null = null;

/** The full, chained ledger (sorted by time), memoized for the session. */
export async function getAuditChain(): Promise<AuditEvent[]> {
  if (chainCache) return chainCache;
  const sorted = [...auditSeed].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const chain: AuditEvent[] = [];
  let prevHash = "";
  for (const raw of sorted) {
    const hash = await sha256(hashInput(prevHash, raw));
    chain.push({ ...raw, prevHash, hash });
    prevHash = hash;
  }
  chainCache = chain;
  return chain;
}

/**
 * Record an action on the ledger, linked to the current tail.
 *
 * Appending rather than rebuilding is the point: the chain is only meaningful
 * if a new link is computed from the hash that is already there. A write that
 * recomputed the whole ledger from source could quietly paper over a break —
 * which is exactly what the chain exists to make impossible.
 */
export async function appendAudit(
  raw: Omit<RawEvent, "id" | "createdAt"> & Partial<Pick<RawEvent, "id" | "createdAt">>,
): Promise<AuditEvent> {
  const chain = await getAuditChain();
  const event: RawEvent = {
    ...raw,
    id: raw.id ?? `au-${Date.now()}-${chain.length}`,
    createdAt: raw.createdAt ?? new Date().toISOString(),
  };
  const prevHash = chain.length > 0 ? chain[chain.length - 1].hash : "";
  const hash = await sha256(hashInput(prevHash, event));
  const linked = { ...event, prevHash, hash };
  chain.push(linked);
  return linked;
}

/** Recompute every link and report the first break, if any. */
export async function verifyAuditChain(): Promise<AuditVerifyResult> {
  const chain = await getAuditChain();
  let prevHash = "";
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    const expected = await sha256(hashInput(prevHash, e));
    if (e.prevHash !== prevHash || e.hash !== expected) {
      return { ok: false, checkedCount: i + 1, brokenAt: { id: e.id, index: i } };
    }
    prevHash = e.hash;
  }
  return { ok: true, checkedCount: chain.length };
}

import type { ID, ISODateString } from "./common";

export type AuditAction =
  | "create"
  | "update"
  | "status-change"
  | "approve"
  | "reject"
  | "assign"
  | "ruling"
  | "upload"
  | "delete";

/**
 * One link in the append-only, hash-chained audit ledger. The backend enforces
 * immutability at the DB level; here the chain is computed so /audit/verify can
 * genuinely walk and validate it.
 */
export interface AuditEvent {
  id: ID;
  entityType: string;
  entityId: ID;
  action: AuditAction | string;
  actorId: ID;
  actorName?: string;
  payload: Record<string, unknown>;
  createdAt: ISODateString;
  /** Hash of the previous event ("" for the genesis event). */
  prevHash: string;
  /** SHA-256 over (prevHash + entity + action + actor + payload + createdAt). */
  hash: string;
}

export interface AuditVerifyResult {
  ok: boolean;
  checkedCount: number;
  /** The first event whose recomputed hash didn't match, if any. */
  brokenAt?: { id: ID; index: number };
}

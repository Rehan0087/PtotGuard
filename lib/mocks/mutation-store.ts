/**
 * Browser-session persistence for the mutation preview workflow.
 *
 * Keep this deliberately narrow: mutations may change parcel ownership, but
 * they must not turn sessionStorage into a second copy of the entire mock DB.
 */
import type { AuditEvent, Mutation, MutationStatus, OwnershipRecord } from "@/lib/types";
import * as db from "./data";

const STORAGE_KEY = "plotguard.mutation-workflow.v1";

interface StoredParcelOwnership {
  id: string;
  ownerId: string;
  ownerName: string;
  lastMutationAt?: string;
}

interface StoredMutationState {
  mutations: Mutation[];
  parcels: StoredParcelOwnership[];
  ownershipRecords: OwnershipRecord[];
  auditChain: AuditEvent[];
}

let hydrated = false;
let hydratedAuditChain: AuditEvent[] | null = null;

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isStoredState(value: unknown): value is StoredMutationState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredMutationState>;
  return Array.isArray(candidate.mutations)
    && Array.isArray(candidate.parcels)
    && Array.isArray(candidate.ownershipRecords)
    && Array.isArray(candidate.auditChain);
}

/** Upgrade snapshots created before the five-step mutation workflow. */
function currentMutationStatus(value: unknown): MutationStatus {
  if (value === "verification") return "under-primary-verification";
  if (value === "objection-period") return "field-investigation";
  const current: MutationStatus[] = [
    "submitted",
    "under-primary-verification",
    "field-investigation",
    "field-verification-complete",
    "approved",
    "rejected",
    "awaiting-dcr-payment",
    "complete",
  ];
  return typeof value === "string" && current.includes(value as MutationStatus)
    ? value as MutationStatus
    : "submitted";
}

/** Restore the workflow snapshot at most once in a browser module lifetime. */
export function hydrateMutationState(): AuditEvent[] | null {
  // Also cover Fast Refresh, where this module can retain `hydrated` while
  // the in-memory fixture array still contains values loaded by older code.
  for (const mutation of db.mutations) {
    mutation.status = currentMutationStatus((mutation as { status?: unknown }).status);
  }
  const storage = browserStorage();
  if (!storage) return null;
  if (hydrated) return hydratedAuditChain;
  hydrated = true;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state: unknown = JSON.parse(raw);
    if (!isStoredState(state)) return null;

    const mutations = state.mutations.map((mutation) => ({
      ...mutation,
      status: currentMutationStatus((mutation as { status?: unknown }).status),
    }));
    db.mutations.splice(0, db.mutations.length, ...mutations);
    db.ownershipRecords.splice(0, db.ownershipRecords.length, ...state.ownershipRecords);
    for (const stored of state.parcels) {
      const parcel = db.parcels.find((item) => item.id === stored.id);
      if (!parcel || typeof stored.ownerId !== "string" || typeof stored.ownerName !== "string") continue;
      parcel.ownerId = stored.ownerId;
      parcel.ownerName = stored.ownerName;
      if (typeof stored.lastMutationAt === "string") parcel.lastMutationAt = stored.lastMutationAt;
      else delete parcel.lastMutationAt;
    }
    hydratedAuditChain = state.auditChain;
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...state, mutations }));
  } catch {
    // A damaged or unavailable preview snapshot must never stop the mock API.
  }
  return hydratedAuditChain;
}

/** Persist only workflow-owned state and the parcel fields an approval changes. */
export function persistMutationState(auditChain: AuditEvent[]): void {
  const storage = browserStorage();
  if (!storage) return;
  const affectedParcelIds = new Set(db.mutations.map((mutation) => mutation.parcelId));

  const state: StoredMutationState = {
    mutations: db.mutations,
    parcels: db.parcels
      .filter(({ id }) => affectedParcelIds.has(id))
      .map(({ id, ownerId, ownerName, lastMutationAt }) => ({
        id,
        ownerId,
        ownerName,
        ...(lastMutationAt ? { lastMutationAt } : {}),
      })),
    ownershipRecords: db.ownershipRecords,
    auditChain,
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Preview persistence is best-effort (private mode/quota may reject it).
  }
}

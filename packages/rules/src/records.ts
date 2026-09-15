import type { MutationStatus, RegistryStatus } from "./types";

/** Mutation rows that make a parcel actively unavailable for another transfer. */
export const ACTIVE_MUTATION_STATUSES = [
  "submitted",
  "under-primary-verification",
  "field-investigation",
  "field-verification-complete",
  "approved",
  "awaiting-dcr-payment",
] as const satisfies readonly MutationStatus[];

/**
 * Project the status shown by Land Office Records from the parcel's persisted
 * non-workflow status and its related mutation rows. Mutation is the workflow
 * source of truth; `under-mutation` is never maintained by the Records UI.
 */
export function recordRegistryStatus(
  baseStatus: RegistryStatus,
  mutations: readonly { status: MutationStatus; disputeId?: string | null }[],
): RegistryStatus {
  if (mutations.some(({ disputeId }) => Boolean(disputeId))) return "disputed";
  return mutations.some(({ status }) =>
    ACTIVE_MUTATION_STATUSES.includes(status as (typeof ACTIVE_MUTATION_STATUSES)[number]))
    ? "under-mutation"
    : baseStatus;
}

/**
 * Returns the reference form that an officer UI may display without exposing
 * the stored national identifier. Already-masked seed/import data is preserved.
 */
export function maskNationalId(value: string | null | undefined): string | undefined {
  const identifier = value?.trim();
  if (!identifier) return undefined;
  if (/^•••• •••• \d{4}$/u.test(identifier)) return identifier;
  return `•••• •••• ${identifier.slice(-4)}`;
}

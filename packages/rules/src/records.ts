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
 * Project the status shown by Land Office Records exclusively from related
 * workflow rows. A stored parcel label is deliberately not an input: it can
 * become stale and produce contradictions such as "Verified" beside an open
 * dispute. Pending is not a record outcome.
 *
 * Precedence is workflow-aware: a flagged OCR document comes first. A dispute
 * linked to the active mutation means that workflow is disputed. Otherwise an
 * active mutation remains under mutation even if the plot has a separate open
 * dispute. With no active mutation, an open dispute is disputed; otherwise the
 * is verified—including after a mutation or dispute process is complete.
 */
export function recordRegistryStatus(
  mutations: readonly { status: MutationStatus; disputeId?: string | null }[],
  openDisputeCount = 0,
  hasFlaggedDocument = false,
): RegistryStatus {
  if (hasFlaggedDocument) return "flagged";
  const activeMutations = mutations.filter(({ status }) =>
    ACTIVE_MUTATION_STATUSES.includes(status as (typeof ACTIVE_MUTATION_STATUSES)[number]));
  // A linked field dispute remains the mutation's visible state through the
  // mediator outcome and until the land officer closes the mutation itself.
  if (activeMutations.some(({ disputeId }) => Boolean(disputeId))) {
    return "disputed";
  }
  if (activeMutations.length > 0) return "under-mutation";
  if (openDisputeCount > 0) return "disputed";
  return "verified";
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

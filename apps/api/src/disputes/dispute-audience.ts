import type { DisputeParty } from "@plotguard/rules";

/**
 * Everyone with an account who should hear about a change to this case: the
 * person who filed it and any party matched to a user. Deduped, and never
 * the actor — telling someone what they just did themselves is noise.
 */
export function disputeAudience(
  dispute: { filedById: string; parties: DisputeParty[] },
  actorId: string,
): string[] {
  const ids = [dispute.filedById, ...dispute.parties.map((p) => p.userId)];
  return [...new Set(ids.filter((id): id is string => Boolean(id) && id !== actorId))];
}

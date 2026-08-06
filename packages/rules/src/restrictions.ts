/**
 * What an encumbrance on a plot actually prevents.
 *
 * A restriction is not a label — it decides whether the land can change hands.
 * Land under a court injunction cannot be transferred at all; land under a
 * mortgage can be, but only with the lender's consent. Getting that distinction
 * wrong in either direction is serious: block a lawful sale and a citizen is
 * stuck, allow a barred one and the registry records a transfer a court has
 * forbidden.
 *
 * Pure, like every rule here — the same answer on the server that refuses the
 * mutation and on the screen that explains why.
 */
import type { ParcelRestriction, RestrictionType } from "./types";

/**
 * `blocks` — nothing can be transferred while it stands.
 * `needs-consent` — transferable, but only with the holder's release.
 */
export type RestrictionEffect = "blocks" | "needs-consent";

const EFFECT: Record<RestrictionType, RestrictionEffect> = {
  // A charge on the land, not a bar: the lender's NOC releases it.
  mortgage: "needs-consent",
  injunction: "blocks",
  attachment: "blocks",
  acquisition: "blocks",
  "non-transferable": "blocks",
};

export function restrictionEffect(type: RestrictionType): RestrictionEffect {
  return EFFECT[type];
}

/**
 * In force at `now`: started, and either open-ended or not yet ended.
 *
 * The boundaries are deliberate. A restriction beginning today is already in
 * force — an injunction does not wait for tomorrow. One ending today has
 * expired, because `toDate` records the day it ceased to bind.
 */
export function activeRestrictions(
  restrictions: ParcelRestriction[],
  now: Date = new Date(),
): ParcelRestriction[] {
  const at = now.getTime();
  return restrictions.filter((r) => {
    const from = new Date(r.fromDate).getTime();
    if (Number.isNaN(from) || from > at) return false;
    if (!r.toDate) return true;
    const to = new Date(r.toDate).getTime();
    return Number.isNaN(to) ? true : to > at;
  });
}

export interface TransferReview {
  /** False when any active restriction blocks outright. */
  canTransfer: boolean;
  /** Active restrictions that bar a transfer entirely. */
  blockers: ParcelRestriction[];
  /** Active restrictions that permit transfer once released. */
  consents: ParcelRestriction[];
}

/**
 * Whether this plot may change hands, and what stands in the way.
 *
 * Returns the restrictions themselves rather than a message: the screen words
 * them per locale and the API refuses with them, from one answer.
 */
export function transferReview(
  restrictions: ParcelRestriction[],
  now: Date = new Date(),
): TransferReview {
  const active = activeRestrictions(restrictions, now);
  const blockers = active.filter((r) => restrictionEffect(r.type) === "blocks");
  const consents = active.filter((r) => restrictionEffect(r.type) === "needs-consent");

  return { canTransfer: blockers.length === 0, blockers, consents };
}

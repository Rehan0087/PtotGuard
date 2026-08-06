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
import type { ParcelRestriction, PublicParcelView, RestrictionType } from "./types";

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

/**
 * Narrow a plot to what an unauthenticated caller may see.
 *
 * One function so the omissions are a single decision with tests behind it,
 * rather than something every endpoint re-derives and one of them eventually
 * gets wrong. Note in particular that `note` is dropped: a restriction's
 * existence is a public fact, but its free text can carry allegations and case
 * particulars that are not.
 */
export function toPublicParcel(
  parcel: {
    ulpin?: string | null;
    dagNo: string;
    khatianNo: string;
    landUse: string;
    area: unknown;
    ownerName: string;
    registryStatus: string;
  },
  restrictions: ParcelRestriction[],
  now: Date = new Date(),
): PublicParcelView {
  return {
    ulpin: parcel.ulpin ?? "",
    dagNo: parcel.dagNo,
    khatianNo: parcel.khatianNo,
    landUse: parcel.landUse as PublicParcelView["landUse"],
    area: parcel.area as PublicParcelView["area"],
    ownerName: parcel.ownerName,
    registryStatus: parcel.registryStatus as PublicParcelView["registryStatus"],
    restrictions: activeRestrictions(restrictions, now).map((r) => ({
      type: r.type,
      authority: r.authority,
      referenceNo: r.referenceNo,
      fromDate: r.fromDate,
      toDate: r.toDate,
    })),
    canTransfer: transferReview(restrictions, now).canTransfer,
  };
}

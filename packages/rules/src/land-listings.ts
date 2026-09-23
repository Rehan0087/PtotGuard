/**
 * Whether a parcel may be listed on the marketplace, and what a listing or
 * one of its inquiries may become next.
 *
 * Listing eligibility asks the same question `transferReview()` already
 * answers for a Mutation ("can this parcel change hands at all") plus one
 * more: it can't already be on the market. Pure, like every rule here — the
 * screen that offers "List for sale" and the endpoint that refuses it both
 * ask this function.
 */
import { transferReview } from "./restrictions";
import type { LandListingInquiryStatus, LandListingStatus, ParcelRestriction, RestrictionType } from "./types";

export type ListingEligibilityBlocker =
  | { code: "restricted"; blockers: RestrictionType[] }
  | { code: "already-listed" };

export interface ListingEligibilityReview {
  canList: boolean;
  blockers: ListingEligibilityBlocker[];
}

export function canListParcel(
  restrictions: ParcelRestriction[],
  hasOpenListing: boolean,
  now: Date = new Date(),
): ListingEligibilityReview {
  const blockers: ListingEligibilityBlocker[] = [];

  const review = transferReview(restrictions, now);
  if (!review.canTransfer) {
    blockers.push({ code: "restricted", blockers: review.blockers.map((r) => r.type) });
  }
  if (hasOpenListing) blockers.push({ code: "already-listed" });

  return { canList: blockers.length === 0, blockers };
}

/**
 * `sold` is terminal and reached only by the land office approving the
 * transfer (see listingAfterMutationDecision) — never by the seller, and
 * never undone: the parcel has a new owner, who lists it afresh if they sell.
 */
const LISTING_ALLOWED: Record<LandListingStatus, LandListingStatus[]> = {
  active: ["under-transfer", "withdrawn"],
  "under-transfer": ["active", "withdrawn"],
  sold: [],
  withdrawn: ["active"],
};

export type ListingTransitionBlocker =
  | { code: "already-sold" }
  | { code: "sold-via-mutation" }
  | { code: "same-status"; status: LandListingStatus }
  | { code: "illegal-transition"; from: LandListingStatus; to: LandListingStatus };

export interface ListingTransitionReview {
  canChange: boolean;
  blockers: ListingTransitionBlocker[];
}

export function listingTransition(from: LandListingStatus, to: LandListingStatus): ListingTransitionReview {
  const blockers: ListingTransitionBlocker[] = [];
  if (from === "sold") blockers.push({ code: "already-sold" });
  else if (to === "sold") blockers.push({ code: "sold-via-mutation" });
  else if (to === from) blockers.push({ code: "same-status", status: from });
  else if (!LISTING_ALLOWED[from].includes(to)) blockers.push({ code: "illegal-transition", from, to });

  return { canChange: blockers.length === 0, blockers };
}

/** The moves a screen may offer from `from`. */
export function listingNextStatuses(from: LandListingStatus): LandListingStatus[] {
  return LISTING_ALLOWED[from];
}

export type InquiryDecisionBlocker =
  | { code: "listing-not-active"; status: LandListingStatus }
  | { code: "inquiry-not-open"; status: LandListingInquiryStatus };

/** Whether the seller may accept or decline this inquiry right now. */
export function canDecideInquiry(
  listingStatus: LandListingStatus,
  inquiryStatus: LandListingInquiryStatus,
): { canDecide: boolean; blocker?: InquiryDecisionBlocker } {
  if (listingStatus !== "active") return { canDecide: false, blocker: { code: "listing-not-active", status: listingStatus } };
  if (inquiryStatus !== "open") return { canDecide: false, blocker: { code: "inquiry-not-open", status: inquiryStatus } };
  return { canDecide: true };
}

/** Whether the buyer may withdraw this inquiry of their own. */
export function canWithdrawInquiry(inquiryStatus: LandListingInquiryStatus): {
  canWithdraw: boolean;
  blocker?: InquiryDecisionBlocker;
} {
  if (inquiryStatus !== "open") return { canWithdraw: false, blocker: { code: "inquiry-not-open", status: inquiryStatus } };
  return { canWithdraw: true };
}

/**
 * What the land office's decision on the resulting sale mutation does to
 * the listing it came from. Approval moved ownership, so the listing is
 * sold; rejection means the deal fell through, so the listing is back on
 * the market and the buyer's accepted interest no longer stands.
 */
export function listingAfterMutationDecision(approved: boolean): {
  listing: LandListingStatus;
  acceptedInquiry: LandListingInquiryStatus;
} {
  return approved
    ? { listing: "sold", acceptedInquiry: "accepted" }
    : { listing: "active", acceptedInquiry: "declined" };
}

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

const LISTING_ALLOWED: Record<LandListingStatus, LandListingStatus[]> = {
  active: ["under-transfer", "withdrawn"],
  "under-transfer": ["active", "withdrawn"],
  withdrawn: ["active"],
};

export type ListingTransitionBlocker =
  | { code: "same-status"; status: LandListingStatus }
  | { code: "illegal-transition"; from: LandListingStatus; to: LandListingStatus };

export interface ListingTransitionReview {
  canChange: boolean;
  blockers: ListingTransitionBlocker[];
}

export function listingTransition(from: LandListingStatus, to: LandListingStatus): ListingTransitionReview {
  const blockers: ListingTransitionBlocker[] = [];
  if (to === from) blockers.push({ code: "same-status", status: from });
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

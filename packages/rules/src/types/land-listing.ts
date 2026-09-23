import type { ID, ISODateString } from "./common";

/**
 * The land marketplace — a citizen lists a parcel they own, other citizens
 * express interest, and the seller picks one to carry into the existing
 * Mutation ("sale") flow. See land-listings.ts for the gates.
 */

export type LandListingStatus = "active" | "under-transfer" | "withdrawn";

export type LandListingInquiryStatus = "open" | "accepted" | "declined" | "withdrawn";

export interface LandListing {
  id: ID;
  parcelId: ID;
  sellerId: ID;
  askingPriceBdt: number;
  description: string;
  status: LandListingStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface LandListingInquiry {
  id: ID;
  listingId: ID;
  buyerId: ID;
  message?: string;
  status: LandListingInquiryStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

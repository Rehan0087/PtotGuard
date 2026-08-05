import type {
  ID,
  ISODateString,
  Area,
  Money,
  GeoPoint,
  GeoPolygon,
} from "./common";

export type LandUse =
  | "agricultural"
  | "residential"
  | "commercial"
  | "industrial"
  | "mixed"
  | "vacant";

export type OwnershipType =
  | "sole"
  | "joint"
  | "inherited"
  | "corporate"
  | "government";

export type RegistryStatus =
  | "verified"
  | "pending"
  | "disputed"
  | "flagged"
  | "under-mutation";

export interface Parcel {
  id: ID;
  /**
   * Citable unique identifier, e.g. "ILR-CUM-DEB-000142" — see buildUlpin().
   * Optional: a parcel whose jurisdiction chain lacks a district or upazila
   * cannot be given one, and a placeholder that looks citable but resolves to
   * nothing would be worse than its absence.
   */
  ulpin?: string;
  /** Dag (plot) number from the cadastral survey, e.g. "CS-142". */
  dagNo: string;
  /** Khatian (record-of-rights) number, e.g. "512". */
  khatianNo: string;
  /** Human-readable label, e.g. "Homestead plot, Rajamehar Mouza". */
  title: string;
  jurisdictionId: ID;
  landUse: LandUse;
  area: Area;
  ownerId: ID;
  /** Denormalized for list views. */
  ownerName: string;
  ownershipType: OwnershipType;
  registryStatus: RegistryStatus;
  centroid: GeoPoint;
  boundary?: GeoPolygon;
  marketValue?: Money;
  registeredAt: ISODateString;
  lastMutationAt?: ISODateString;
  openDisputeCount: number;
}

export type AcquisitionType =
  | "purchase"
  | "inheritance"
  | "gift"
  | "grant"
  | "partition"
  | "court-order";

/** One row in a parcel's ownership history / chain of title. */
export interface OwnershipRecord {
  id: ID;
  parcelId: ID;
  ownerId: ID;
  ownerName: string;
  acquisitionType: AcquisitionType;
  fromDate: ISODateString;
  /** null = current owner. */
  toDate: ISODateString | null;
  documentId?: ID;
}

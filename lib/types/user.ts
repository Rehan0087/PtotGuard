import type { ID, ISODateString } from "./common";

/** The five PlotGuard portals. Drives routing, nav, and permissions. */
export type Role = "citizen" | "land-office" | "field-agent" | "mediator" | "admin";

export const ROLES: Role[] = [
  "citizen",
  "land-office",
  "field-agent",
  "mediator",
  "admin",
];

export type JurisdictionLevel = "division" | "district" | "upazila" | "mouza";

export interface Jurisdiction {
  id: ID;
  code: string; // e.g. "CUM-DEB"
  name: string; // e.g. "Debidwar Upazila"
  /**
   * The name as it appears on the record itself, in Bangla — e.g. "দেবিদ্বার
   * উপজেলা". Optional: older rows may not carry one, and the Latin `name` is
   * always the one used for search, sorting, and codes.
   */
  nameBn?: string;
  level: JurisdictionLevel;
  parentId: ID | null;
}

export type UserStatus = "active" | "suspended" | "invited";

export interface User {
  id: ID;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  jurisdictionId: ID;
  /** Masked in the UI, e.g. "•••• •••• 4821". Never store the raw value client-side. */
  nationalId?: string;
  avatarUrl?: string;
  status: UserStatus;
  /** Official designation, e.g. "Sub-Registrar", "Survey Officer". */
  title?: string;
  createdAt: ISODateString;
}

/**
 * Who a new grievance lands with.
 *
 * A complaint about staff conduct or corruption must never reach the office
 * it is about, so it goes straight to an administrator. Anything else goes to
 * the nearest land-office officer responsible for the filer's area — the
 * officer sitting at the filer's own jurisdiction, or failing that the
 * closest one above it. Citizens are registered at mouza level and officers
 * at upazila level, so an exact-jurisdiction match alone would route nothing.
 */
import { ancestryOf } from "./jurisdictions";
import type { GrievanceCategory, Jurisdiction } from "./types";

export const ESCALATED_GRIEVANCE_CATEGORIES: GrievanceCategory[] = ["staff-conduct", "corruption"];

export interface GrievanceRouting {
  assignedOfficerId?: string;
  escalatedToId?: string;
}

export function routeGrievance(
  category: GrievanceCategory,
  filerJurisdictionId: string,
  officers: { id: string; jurisdictionId: string }[],
  admins: { id: string }[],
  jurisdictions: Jurisdiction[],
): GrievanceRouting {
  if (ESCALATED_GRIEVANCE_CATEGORIES.includes(category)) {
    return { escalatedToId: admins[0]?.id };
  }
  const nearestFirst = ancestryOf(filerJurisdictionId, jurisdictions).reverse();
  for (const level of nearestFirst) {
    const officer = officers.find((o) => o.jurisdictionId === level.id);
    if (officer) return { assignedOfficerId: officer.id };
  }
  return {};
}

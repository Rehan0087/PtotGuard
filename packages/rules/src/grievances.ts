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
import type { GrievanceCategory, GrievanceStatus, Jurisdiction } from "./types";

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

/** Still waiting on the office — the only statuses the response deadline applies to. */
export const OPEN_GRIEVANCE_STATUSES: GrievanceStatus[] = ["submitted", "under-review", "investigating"];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GrievanceSla {
  /** `none` when no deadline was recorded; `closed` once decided or escalated. */
  state: "none" | "closed" | "on-track" | "overdue";
  /** Whole days until the deadline (negative once past); null without one. */
  daysLeft: number | null;
}

type SlaInput = { status: GrievanceStatus; slaDeadline?: string | Date | null };

/** Where a grievance stands against its response deadline, for the screens. */
export function grievanceSla(grievance: SlaInput, now: Date = new Date()): GrievanceSla {
  if (!grievance.slaDeadline) return { state: "none", daysLeft: null };
  const ms = new Date(grievance.slaDeadline).getTime() - now.getTime();
  const daysLeft = ms >= 0 ? Math.ceil(ms / DAY_MS) : -Math.ceil(-ms / DAY_MS);
  if (!OPEN_GRIEVANCE_STATUSES.includes(grievance.status)) return { state: "closed", daysLeft };
  return { state: ms < 0 ? "overdue" : "on-track", daysLeft };
}

/**
 * An open grievance the office let run past its deadline goes over the
 * office's head, once. One already routed to an administrator — conduct and
 * corruption complaints are, at filing — has nowhere higher to go.
 */
export function shouldEscalateGrievance(
  grievance: SlaInput & { escalatedToId?: string | null },
  now: Date = new Date(),
): boolean {
  return !grievance.escalatedToId && grievanceSla(grievance, now).state === "overdue";
}

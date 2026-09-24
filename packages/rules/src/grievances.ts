/**
 * Who a new grievance lands with.
 *
 * Every citizen complaint goes to an administrator. Keeping complaints out of
 * the operational land-office queue gives citizens one accountable review
 * path and prevents the office being complained about from deciding its own
 * case.
 */
import type { GrievanceStatus } from "./types";

export interface GrievanceRouting {
  escalatedToId?: string;
}

export function routeGrievance(admins: { id: string }[]): GrievanceRouting {
  return { escalatedToId: admins[0]?.id };
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
 * office's head, once. New complaints are routed to an administrator at
 * filing and therefore have nowhere higher to go; this remains for legacy
 * records that were originally assigned to a land-office officer.
 */
export function shouldEscalateGrievance(
  grievance: SlaInput & { escalatedToId?: string | null },
  now: Date = new Date(),
): boolean {
  return !grievance.escalatedToId && grievanceSla(grievance, now).state === "overdue";
}

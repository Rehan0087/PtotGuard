import type {
  AcquisitionAppealDecision,
  AcquisitionDetails,
  ServiceApplicationStatus,
} from "./types";

export type AcquisitionAction =
  | "field-review"
  | "citizen-accept"
  | "citizen-appeal"
  | `appeal-${AcquisitionAppealDecision}`;

export type AcquisitionTransitionBlocker =
  | { code: "wrong-stage"; stage: AcquisitionDetails["stage"] }
  | { code: "wrong-status"; status: ServiceApplicationStatus };

export function acquisitionTransition(
  details: AcquisitionDetails,
  status: ServiceApplicationStatus,
  action: AcquisitionAction,
): { allowed: boolean; blockers: AcquisitionTransitionBlocker[] } {
  const expected = action === "field-review"
    ? { stage: "field-review" as const, status: "field-investigation" as const }
    : action === "citizen-accept" || action === "citizen-appeal"
      ? { stage: "citizen-decision" as const, status: "under-review" as const }
      : { stage: "appeal-review" as const, status: "hearing-scheduled" as const };
  const blockers: AcquisitionTransitionBlocker[] = [];
  if (details.stage !== expected.stage) blockers.push({ code: "wrong-stage", stage: details.stage });
  if (status !== expected.status) blockers.push({ code: "wrong-status", status });
  return { allowed: blockers.length === 0, blockers };
}

export function validIncreasedAward(current: number | undefined, next: number | undefined): boolean {
  return typeof current === "number" && typeof next === "number" && next > current;
}

import type { FieldSurveyStatus } from "./types";

export type FieldSurveyTransitionReview =
  | { allowed: true }
  | { allowed: false; code: "invalid-transition" };

const NEXT_SURVEY_STATUSES: Record<FieldSurveyStatus, FieldSurveyStatus[]> = {
  "not-started": ["in-progress"],
  "in-progress": ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/** The explicit, one-way lifecycle for a field verification session. */
export function reviewFieldSurveyTransition(
  from: FieldSurveyStatus,
  to: FieldSurveyStatus,
): FieldSurveyTransitionReview {
  return NEXT_SURVEY_STATUSES[from].includes(to)
    ? { allowed: true }
    : { allowed: false, code: "invalid-transition" };
}

import { describe, expect, it } from "vitest";
import { reviewFieldSurveyTransition } from "./field-survey";

describe("field survey lifecycle", () => {
  it("starts only from the derived not-started state", () => {
    expect(reviewFieldSurveyTransition("not-started", "in-progress")).toEqual({
      allowed: true,
    });
  });

  it.each(["completed", "failed", "cancelled"] as const)(
    "allows an active survey to become %s",
    (status) => {
      expect(reviewFieldSurveyTransition("in-progress", status)).toEqual({
        allowed: true,
      });
    },
  );

  it("rejects repeated, backward, and terminal transitions", () => {
    expect(reviewFieldSurveyTransition("in-progress", "in-progress")).toEqual({
      allowed: false,
      code: "invalid-transition",
    });
    expect(reviewFieldSurveyTransition("completed", "in-progress")).toEqual({
      allowed: false,
      code: "invalid-transition",
    });
  });
});

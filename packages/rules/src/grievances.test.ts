import { describe, expect, it } from "vitest";
import { grievanceSla, routeGrievance, shouldEscalateGrievance } from "./grievances";
const admins = [{ id: "usr-admin" }];

describe("routeGrievance", () => {
  it("routes every citizen complaint to an administrator", () => {
    expect(routeGrievance(admins)).toEqual({ escalatedToId: "usr-admin" });
  });

  it("leaves the destination empty when no active administrator exists", () => {
    expect(routeGrievance([])).toEqual({ escalatedToId: undefined });
  });
});

describe("grievanceSla", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("counts whole days left while on track", () => {
    expect(grievanceSla({ status: "under-review", slaDeadline: "2026-09-26T12:00:00Z" }, now)).toEqual({ state: "on-track", daysLeft: 2 });
  });

  it("reports overdue with a negative day count once past", () => {
    expect(grievanceSla({ status: "submitted", slaDeadline: "2026-09-22T11:00:00Z" }, now)).toEqual({ state: "overdue", daysLeft: -3 });
  });

  it("stops the clock once the grievance is decided or escalated", () => {
    for (const status of ["resolved", "dismissed", "escalated"] as const) {
      expect(grievanceSla({ status, slaDeadline: "2026-09-01T00:00:00Z" }, now).state).toBe("closed");
    }
  });

  it("has nothing to say without a deadline", () => {
    expect(grievanceSla({ status: "submitted", slaDeadline: null }, now)).toEqual({ state: "none", daysLeft: null });
  });
});

describe("shouldEscalateGrievance", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const overdue = { status: "investigating" as const, slaDeadline: "2026-09-20T00:00:00Z" };

  it("escalates an open grievance past its deadline", () => {
    expect(shouldEscalateGrievance({ ...overdue, escalatedToId: null }, now)).toBe(true);
  });

  it("leaves one still within its deadline alone", () => {
    expect(shouldEscalateGrievance({ ...overdue, slaDeadline: "2026-09-30T00:00:00Z" }, now)).toBe(false);
  });

  it("never escalates twice, nor a complaint already with an administrator", () => {
    expect(shouldEscalateGrievance({ ...overdue, escalatedToId: "usr-admin" }, now)).toBe(false);
  });

  it("leaves decided grievances alone", () => {
    expect(shouldEscalateGrievance({ ...overdue, status: "resolved" }, now)).toBe(false);
  });
});

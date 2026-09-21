import { describe, expect, it } from "vitest";
import { passwordResetGate, roleChangeGate } from "./accounts";

const admin = { id: "usr-admin", role: "admin" as const };

describe("roleChangeGate", () => {
  it("promotes somebody else", () => {
    expect(roleChangeGate(admin.id, { id: "usr-ayesha", role: "citizen" }, "field-agent")).toEqual({
      canChange: true,
      blockers: [],
    });
  });

  it("refuses changing your own role, however it is spelled", () => {
    const review = roleChangeGate(admin.id, admin, "citizen");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toContainEqual({ code: "self-role-change" });
  });

  it("refuses a no-op", () => {
    const review = roleChangeGate(admin.id, { id: "usr-officer", role: "land-office" }, "land-office");
    expect(review.canChange).toBe(false);
    expect(review.blockers).toContainEqual({ code: "same-role", role: "land-office" });
  });

  it("reports both problems when a self-change is also a no-op", () => {
    const review = roleChangeGate(admin.id, admin, "admin");
    expect(review.blockers).toHaveLength(2);
  });
});

describe("passwordResetGate", () => {
  it("resets an account somebody actually uses", () => {
    expect(passwordResetGate({ status: "active" })).toEqual({ canReset: true, blockers: [] });
  });

  it("still resets a suspended account — reinstating should not need a second step", () => {
    expect(passwordResetGate({ status: "suspended" }).canReset).toBe(true);
  });

  it("refuses an invitation nobody has taken up", () => {
    const review = passwordResetGate({ status: "invited" });
    expect(review.canReset).toBe(false);
    expect(review.blockers).toContainEqual({ code: "never-signed-in", status: "invited" });
  });
});

import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrievancesController } from "./grievances.controller";

const now = new Date("2026-09-24T12:00:00.000Z");
const request = { header: (name: string) => (name === "x-plotguard-role" ? "citizen" : undefined) } as never;

function fixture(grievances: Array<Record<string, unknown>>, escalatedCount = 1) {
  const tx = {
    grievance: { updateMany: vi.fn().mockResolvedValue({ count: escalatedCount }) },
    grievanceEvent: { create: vi.fn().mockResolvedValue({}) },
    appNotification: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    grievance: { findMany: vi.fn().mockImplementation(async ({ where }) => (where.filedById ? [] : grievances)) },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: "usr-admin", name: "Registry Administrator" }),
      findUnique: vi.fn().mockResolvedValue({ id: "usr-ayesha", role: "citizen" }),
    },
    $transaction: vi.fn().mockImplementation(async (fn) => fn(tx)),
  };
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  return { tx, prisma, audit, controller: new GrievancesController(prisma as never, audit as never) };
}

const overdue = {
  id: "grv-1", caseNumber: "GRV-2026-01000", status: "under-review", filedById: "usr-ayesha",
  escalatedToId: null, slaDeadline: new Date("2026-09-20T00:00:00.000Z"),
};

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe("grievance SLA escalation", () => {
  it("escalates an overdue open grievance to an administrator before listing", async () => {
    const f = fixture([overdue]);
    await f.controller.findAll(request);

    expect(f.tx.grievance.updateMany).toHaveBeenCalledWith({
      where: { id: "grv-1", escalatedToId: null, status: { in: ["submitted", "under-review", "investigating"] } },
      data: { status: "escalated", escalatedToId: "usr-admin", escalatedAt: now, updatedAt: now },
    });
    expect(f.tx.grievanceEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ grievanceId: "grv-1", type: "escalated" }) });
    expect(f.audit.append).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      entityType: "grievance", entityId: "grv-1", payload: expect.objectContaining({ to: "escalated", reason: "sla-missed" }) }));
    expect(f.tx.appNotification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "usr-admin" }) });
    expect(f.tx.appNotification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "usr-ayesha" }) });
  });

  it("leaves a grievance still within its deadline alone", async () => {
    const f = fixture([{ ...overdue, slaDeadline: new Date("2026-09-30T00:00:00.000Z") }]);
    await f.controller.findAll(request);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("writes nothing more when a concurrent read already escalated it", async () => {
    const f = fixture([overdue], 0);
    await f.controller.findAll(request);
    expect(f.tx.grievance.updateMany).toHaveBeenCalled();
    expect(f.tx.grievanceEvent.create).not.toHaveBeenCalled();
    expect(f.audit.append).not.toHaveBeenCalled();
    expect(f.tx.appNotification.create).not.toHaveBeenCalled();
  });
});

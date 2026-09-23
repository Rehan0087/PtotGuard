import { describe, expect, it, vi } from "vitest";
import { RevenueCasesController } from "./revenue-cases.controller";

type TestApplication = {
  id: string;
  applicationNo: string;
  serviceType: string;
  status: string;
  applicantId: string;
  assignedOfficerId: string;
  assignedMediatorId: string | null;
  details: Record<string, unknown>;
};

const application: TestApplication = {
  id: "sa-case",
  applicationNo: "RVC-2026-001000",
  serviceType: "revenue-case",
  status: "submitted",
  applicantId: "usr-citizen",
  assignedOfficerId: "usr-officer",
  assignedMediatorId: null,
  details: {},
};

const officerRequest = { user: { id: "usr-officer", role: "land-office" }, header: () => undefined } as never;
const mediatorRequest = { user: { id: "usr-mediator", role: "mediator" }, header: () => undefined } as never;

function setup(found: TestApplication = application) {
  const tx = {
    serviceApplication: { update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...found, ...data })) },
    serviceApplicationEvent: { create: vi.fn().mockResolvedValue({}) },
    appNotification: { create: vi.fn().mockResolvedValue({ id: "ntf-1" }) },
  };
  const prisma = {
    serviceApplication: { findUnique: vi.fn().mockResolvedValue(found) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "usr-mediator", name: "Settlement Officer", role: "mediator", status: "active" }) },
    $transaction: vi.fn().mockImplementation((work) => work(tx)),
  };
  const audit = { append: vi.fn().mockResolvedValue(undefined) };
  return { controller: new RevenueCasesController(prisma as never, audit as never), tx, audit };
}

describe("revenue case handoff", () => {
  it("moves a filed case to the selected settlement officer", async () => {
    const { controller, tx } = setup();
    const result = await controller.assign("sa-case", { mediatorId: "usr-mediator" }, officerRequest);

    expect(tx.serviceApplication.update).toHaveBeenCalledWith({
      where: { id: "sa-case" },
      data: { assignedMediatorId: "usr-mediator", status: "under-review" },
    });
    expect(result.assignedMediatorId).toBe("usr-mediator");
    expect(tx.appNotification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "usr-mediator", href: "/cases" }),
    }));
  });

  it("lets only the assigned settlement officer schedule the hearing", async () => {
    const assigned = { ...application, assignedMediatorId: "usr-mediator", status: "under-review" };
    const { controller, tx } = setup(assigned);
    await controller.scheduleHearing("sa-case", { hearingAt: "2026-10-10T05:30:00.000Z" }, mediatorRequest);
    expect(tx.serviceApplication.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "hearing-scheduled" }),
    }));

    const otherRequest = { user: { id: "usr-other", role: "mediator" }, header: () => undefined } as never;
    await expect(controller.scheduleHearing("sa-case", { hearingAt: "2026-10-11T05:30:00.000Z" }, otherRequest)).rejects.toThrow("Revenue case not found");
  });
});

import { describe, expect, it, vi } from "vitest";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  it("acquires the transaction ledger lock before reading the audit tail", async () => {
    const order: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async () => {
        order.push("lock");
        return 1;
      }),
      auditEvent: {
        findFirst: vi.fn(async () => {
          order.push("tail");
          return null;
        }),
        create: vi.fn(async () => {
          order.push("create");
          return {};
        }),
      },
      user: {
        findUnique: vi.fn(async () => {
          order.push("actor");
          return { name: "Officer" };
        }),
      },
    };

    await new AuditService().append(tx as never, {
      entityType: "mutation",
      entityId: "m-1",
      action: "approve",
      actorId: "usr-officer",
      payload: { newStatus: "approved" },
    });

    expect(order[0]).toBe("lock");
    expect(order.indexOf("tail")).toBeGreaterThan(order.indexOf("lock"));
    expect(order.indexOf("create")).toBeGreaterThan(order.indexOf("tail"));
  });
});

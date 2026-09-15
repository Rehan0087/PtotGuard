import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { CLOSED_DISPUTE_STATUSES, openDisputeCounts } from "./parcel-view";

describe("openDisputeCounts", () => {
  it("counts current open disputes from the database and excludes closed cases", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { parcelId: "p-1", _count: 2 },
      { parcelId: "p-2", _count: 1 },
    ]);
    const prisma = { dispute: { groupBy } } as unknown as PrismaService;

    const counts = await openDisputeCounts(prisma, ["p-1", "p-2", "p-3"]);

    expect(groupBy).toHaveBeenCalledWith({
      by: ["parcelId"],
      where: {
        parcelId: { in: ["p-1", "p-2", "p-3"] },
        status: { notIn: CLOSED_DISPUTE_STATUSES },
      },
      _count: true,
    });
    expect(counts.get("p-1")).toBe(2);
    expect(counts.get("p-2")).toBe(1);
    expect(counts.has("p-3")).toBe(false);
  });

  it("does not query the database for an empty parcel list", async () => {
    const groupBy = vi.fn();
    const prisma = { dispute: { groupBy } } as unknown as PrismaService;

    expect(await openDisputeCounts(prisma, [])).toEqual(new Map());
    expect(groupBy).not.toHaveBeenCalled();
  });
});

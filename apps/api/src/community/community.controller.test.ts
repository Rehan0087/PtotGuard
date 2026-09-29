import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { CommunityController } from "./community.controller";

function request(id: string, role: string) {
  return { user: { id, role }, header: () => undefined } as never;
}

function postRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "community-1",
    authorId: "usr-officer",
    author: { name: "Nasrin Akter", role: "land-office" },
    title: "Office announcement",
    body: "The office will open at ten.",
    kind: "announcement",
    createdAt: new Date("2026-09-26T08:00:00Z"),
    updatedAt: new Date("2026-09-26T08:00:00Z"),
    comments: [],
    votes: [],
    ...overrides,
  };
}

describe("community", () => {
  it("lets land-office users publish announcements and notifies every other active user", async () => {
    const tx = {
      communityPost: { create: vi.fn().mockResolvedValue(postRecord()) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: "usr-citizen" }, { id: "usr-agent" }]) },
      appNotification: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "usr-officer", role: "land-office" }) },
      communityPost: { findUnique: vi.fn().mockResolvedValue(postRecord()) },
      $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    };
    const controller = new CommunityController(prisma as never);

    const result = await controller.create(
      { title: " Office announcement ", body: " The office will open at ten. ", kind: "announcement" },
      request("usr-officer", "land-office"),
    );

    expect(result.kind).toBe("announcement");
    expect(tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { not: "usr-officer" }, status: "active" },
    }));
    expect(tx.appNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: "usr-citizen", href: "/community#community-1" }),
        expect.objectContaining({ userId: "usr-agent", href: "/community#community-1" }),
      ]),
    });
  });

  it("rejects announcements from every non-land-office role", async () => {
    for (const role of ["citizen", "field-agent", "mediator", "admin"]) {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ id: `usr-${role}`, role }) },
      };
      const controller = new CommunityController(prisma as never);
      await expect(controller.create(
        { title: "Not official", body: "This cannot be an announcement.", kind: "announcement" },
        request(`usr-${role}`, role),
      )).rejects.toMatchObject({ status: 403 });
    }
  });

  it("toggles the same vote off instead of counting it twice", async () => {
    const prisma = {
      communityPost: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: "community-1" })
          .mockResolvedValueOnce(postRecord()),
      },
      communityVote: {
        findUnique: vi.fn().mockResolvedValue({ postId: "community-1", userId: "usr-citizen", value: 1 }),
        delete: vi.fn().mockResolvedValue({}),
        upsert: vi.fn(),
      },
    };
    const controller = new CommunityController(prisma as never);

    await controller.vote("community-1", { value: 1 }, request("usr-citizen", "citizen"));

    expect(prisma.communityVote.delete).toHaveBeenCalledWith({
      where: { postId_userId: { postId: "community-1", userId: "usr-citizen" } },
    });
    expect(prisma.communityVote.upsert).not.toHaveBeenCalled();
  });
});


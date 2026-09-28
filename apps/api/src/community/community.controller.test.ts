import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../common/domain-exceptions";
import { CommunityController } from "./community.controller";

const request = { user: { id: "usr-ayesha", role: "citizen" }, header: () => undefined } as never;

function prismaMock() {
  return {
    communityPost: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    communityComment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    communityVote: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("CommunityController", () => {
  it("rejects a comment when the post does not exist", async () => {
    const prisma = prismaMock();
    prisma.communityPost.findUnique.mockResolvedValue(null);
    const controller = new CommunityController(prisma as never);

    await expect(controller.createComment("missing", { content: "Hello" }, request))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.communityComment.create).not.toHaveBeenCalled();
  });

  it("only accepts a reply parent from the same post", async () => {
    const prisma = prismaMock();
    prisma.communityPost.findUnique.mockResolvedValue({ id: "cp-1" });
    prisma.communityComment.findFirst.mockResolvedValue(null);
    const controller = new CommunityController(prisma as never);

    await expect(controller.createComment("cp-1", { content: "Reply", parentId: "cc-other" }, request))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.communityComment.findFirst).toHaveBeenCalledWith({
      where: { id: "cc-other", postId: "cp-1" },
      select: { id: true },
    });
  });

  it("returns JSON when removing a vote that is already absent", async () => {
    const prisma = prismaMock();
    prisma.communityPost.findUnique.mockResolvedValue({ id: "cp-1" });
    prisma.communityVote.findFirst.mockResolvedValue(null);
    const controller = new CommunityController(prisma as never);

    await expect(controller.votePost("cp-1", { value: 0 }, request)).resolves.toEqual({ value: 0 });
    expect(prisma.communityVote.create).not.toHaveBeenCalled();
  });

  it("does not create a vote for a missing comment", async () => {
    const prisma = prismaMock();
    prisma.communityComment.findUnique.mockResolvedValue(null);
    const controller = new CommunityController(prisma as never);

    await expect(controller.voteComment("missing", { value: 1 }, request))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.communityVote.create).not.toHaveBeenCalled();
  });
});

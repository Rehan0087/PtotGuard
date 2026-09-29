import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { currentUserId } from "../auth/dev-current-user";
import { ForbiddenError, NotFoundError } from "../common/domain-exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCommunityCommentDto } from "./create-community-comment.dto";
import { CreateCommunityPostDto } from "./create-community-post.dto";
import { VoteCommunityPostDto } from "./vote-community-post.dto";

@UseGuards(AccessTokenGuard)
@Controller("community")
export class CommunityController {
  constructor(private readonly prisma: PrismaService) {}

  private async responseFor(postId: string, viewerId: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: { name: true, role: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { name: true, role: true } } },
        },
        votes: { select: { userId: true, value: true } },
      },
    });
    if (!post) throw new NotFoundError("Community post not found");

    return {
      id: post.id,
      authorId: post.authorId,
      authorName: post.author.name,
      authorRole: post.author.role,
      title: post.title,
      body: post.body,
      kind: post.kind,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      score: post.votes.reduce((sum, vote) => sum + vote.value, 0),
      viewerVote: post.votes.find((vote) => vote.userId === viewerId)?.value ?? 0,
      commentCount: post.comments.length,
      comments: post.comments.map((comment) => ({
        id: comment.id,
        postId: comment.postId,
        authorId: comment.authorId,
        authorName: comment.author.name,
        authorRole: comment.author.role,
        body: comment.body,
        createdAt: comment.createdAt,
      })),
    };
  }

  @Get()
  async list(@Req() req: Request) {
    const viewerId = currentUserId(req);
    const posts = await this.prisma.communityPost.findMany({
      orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    return Promise.all(posts.map((post) => this.responseFor(post.id, viewerId)));
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateCommunityPostDto, @Req() req: Request) {
    const authorId = currentUserId(req);
    const author = await this.prisma.user.findUnique({ where: { id: authorId } });
    if (!author) throw new NotFoundError("User not found");
    const kind = body.kind ?? "discussion";
    if (kind === "announcement" && author.role !== "land-office") {
      throw new ForbiddenError("Only the land office can publish announcements");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const post = await tx.communityPost.create({
        data: {
          id: `community-${randomUUID()}`,
          authorId,
          title: body.title.trim(),
          body: body.body.trim(),
          kind,
        },
      });
      if (kind === "announcement") {
        const recipients = await tx.user.findMany({
          where: { id: { not: authorId }, status: "active" },
          select: { id: true },
        });
        await tx.appNotification.createMany({
          data: recipients.map((recipient) => ({
            id: `n-${randomUUID()}`,
            userId: recipient.id,
            severity: "info",
            title: "New land-office announcement",
            body: post.title,
            content: { code: "community-announcement", postId: post.id, title: post.title },
            href: `/community#${post.id}`,
          })),
        });
      }
      return post;
    });
    return this.responseFor(created.id, authorId);
  }

  @Post(":id/comments")
  @HttpCode(201)
  async comment(
    @Param("id") postId: string,
    @Body() body: CreateCommunityCommentDto,
    @Req() req: Request,
  ) {
    const authorId = currentUserId(req);
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError("Community post not found");
    await this.prisma.communityComment.create({
      data: {
        id: `community-comment-${randomUUID()}`,
        postId,
        authorId,
        body: body.body.trim(),
      },
    });
    return this.responseFor(postId, authorId);
  }

  @Post(":id/vote")
  async vote(
    @Param("id") postId: string,
    @Body() body: VoteCommunityPostDto,
    @Req() req: Request,
  ) {
    const userId = currentUserId(req);
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundError("Community post not found");
    const existing = await this.prisma.communityVote.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing?.value === body.value) {
      await this.prisma.communityVote.delete({ where: { postId_userId: { postId, userId } } });
    } else {
      await this.prisma.communityVote.upsert({
        where: { postId_userId: { postId, userId } },
        create: { postId, userId, value: body.value },
        update: { value: body.value, votedAt: new Date() },
      });
    }
    return this.responseFor(postId, userId);
  }
}

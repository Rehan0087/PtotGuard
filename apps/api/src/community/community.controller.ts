import { Controller, Get, Post, Param, Body, UseGuards, Req } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { currentUserId } from "../auth/dev-current-user";
import type { Request } from "express";
import { randomUUID } from "crypto";
import { NotFoundError } from "../common/domain-exceptions";
import { CreatePostDto, CreateCommentDto, VoteDto } from "./community.dto";

@Controller("community")
@UseGuards(AccessTokenGuard)
export class CommunityController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("posts")
  async getPosts() {
    return this.prisma.communityPost.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { comments: true, votes: true } },
        votes: true,
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
            votes: true,
          }
        },
      },
    });
  }

  @Get("posts/:id")
  async getPost(@Param("id") id: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
            votes: true,
          }
        },
        votes: true,
        _count: { select: { comments: true, votes: true } },
      },
    });
    if (!post) throw new NotFoundError("Post not found");
    return post;
  }

  @Post("posts")
  async createPost(@Body() body: CreatePostDto, @Req() req: Request) {
    const authorId = currentUserId(req);
    return this.prisma.communityPost.create({
      data: {
        id: `cp-${randomUUID()}`,
        title: body.title,
        content: body.content,
        authorId,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { comments: true, votes: true } },
        votes: true
      }
    });
  }

  @Post("posts/:id/comments")
  async createComment(
    @Param("id") postId: string,
    @Body() body: CreateCommentDto,
    @Req() req: Request
  ) {
    const authorId = currentUserId(req);
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundError("Post not found");
    if (body.parentId) {
      const parent = await this.prisma.communityComment.findFirst({
        where: { id: body.parentId, postId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundError("Parent comment not found");
    }
    return this.prisma.communityComment.create({
      data: {
        id: `cc-${randomUUID()}`,
        content: body.content,
        postId,
        parentId: body.parentId,
        authorId,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        votes: true
      }
    });
  }

  @Post("posts/:id/vote")
  async votePost(@Param("id") postId: string, @Body() body: VoteDto, @Req() req: Request) {
    const userId = currentUserId(req);
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundError("Post not found");
    const existing = await this.prisma.communityVote.findFirst({
      where: { userId, postId, commentId: null }
    });

    if (existing) {
      if (body.value === 0) {
        return this.prisma.communityVote.delete({ where: { id: existing.id } });
      }
      return this.prisma.communityVote.update({
        where: { id: existing.id },
        data: { value: body.value }
      });
    }

    if (body.value !== 0) {
      return this.prisma.communityVote.create({
        data: {
          id: `cv-${randomUUID()}`,
          userId,
          postId,
          value: body.value
        }
      });
    }
    return { value: 0 };
  }

  @Post("comments/:id/vote")
  async voteComment(@Param("id") commentId: string, @Body() body: VoteDto, @Req() req: Request) {
    const userId = currentUserId(req);
    const comment = await this.prisma.communityComment.findUnique({ where: { id: commentId }, select: { id: true } });
    if (!comment) throw new NotFoundError("Comment not found");
    const existing = await this.prisma.communityVote.findFirst({
      where: { userId, commentId, postId: null }
    });

    if (existing) {
      if (body.value === 0) {
        return this.prisma.communityVote.delete({ where: { id: existing.id } });
      }
      return this.prisma.communityVote.update({
        where: { id: existing.id },
        data: { value: body.value }
      });
    }

    if (body.value !== 0) {
      return this.prisma.communityVote.create({
        data: {
          id: `cv-${randomUUID()}`,
          userId,
          commentId,
          value: body.value
        }
      });
    }
    return { value: 0 };
  }
}

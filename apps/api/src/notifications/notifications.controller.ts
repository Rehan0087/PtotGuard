import { Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() req: Request) {
    return this.prisma.appNotification.findMany({
      where: { userId: currentUserId(req) },
      orderBy: { at: "desc" },
    });
  }

  /**
   * Scoped to the caller's own inbox, which the mock does not do — it looks
   * up by id alone, so any signed-in user could mark another user's
   * notification read. Harmless in a single-tab mock, an authorization bug
   * against a real multi-user database. 404 rather than 403 on someone
   * else's notification: "not yours" and "doesn't exist" should be the same
   * answer, or the response tells you which ids are real.
   */
  // 200, not Nest's default 201 for POST: marking read creates nothing, and
  // the mock these routes mirror answers 200. Same for read-all below.
  @Post(":id/read")
  @HttpCode(200)
  async markRead(@Param("id") id: string, @Req() req: Request) {
    const notification = await this.prisma.appNotification.findFirst({
      where: { id, userId: currentUserId(req) },
    });
    if (!notification) throw new NotFoundError("Notification not found");

    return this.prisma.appNotification.update({ where: { id }, data: { read: true } });
  }

  @Post("read-all")
  @HttpCode(200)
  async markAllRead(@Req() req: Request) {
    await this.prisma.appNotification.updateMany({
      where: { userId: currentUserId(req), read: false },
      data: { read: true },
    });
    return { ok: true };
  }
}

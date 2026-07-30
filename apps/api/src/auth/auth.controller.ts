import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "./dev-current-user";

@Controller("auth")
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  async me(@Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUserId(req) } });
    if (!user) throw new NotFoundError("User not found");
    const jurisdiction = await this.prisma.jurisdiction.findUnique({
      where: { id: user.jurisdictionId },
    });
    return { user, jurisdiction };
  }
}

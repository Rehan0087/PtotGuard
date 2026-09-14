import { Controller, Get, Req, Patch, Body } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { ConflictError, NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "./dev-current-user";
import { UpdateProfileDto } from "./update-profile.dto";

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

  @Patch("me")
  async updateMe(@Req() req: Request, @Body() body: UpdateProfileDto) {
    const id = currentUserId(req);
    const email = body.email?.trim().toLowerCase();
    if (email) {
      const emailOwner = await this.prisma.user.findUnique({ where: { email } });
      if (emailOwner && emailOwner.id !== id) {
        throw new ConflictError("Email address is already in use.");
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl.trim() || null } : {}),
        ...(body.profileDetails !== undefined ? { profileDetails: body.profileDetails } : {}),
      },
    });
    return user;
  }
}

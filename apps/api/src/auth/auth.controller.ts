import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { Role } from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";
import {
  currentUserId,
  issueAuthTokens,
  verifyAuthToken,
  verifyPassword,
} from "./dev-current-user";
import { UpdateProfileDto } from "./update-profile.dto";
import { LoginDto } from "./login.dto";
import { RefreshAuthDto } from "./refresh-auth.dto";
import { AccessTokenGuard } from "./access-token.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email.trim().toLowerCase() },
      omit: { passwordHash: false },
    });
    if (!user || user.status !== "active" || !verifyPassword(body.password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return {
      user: safeUser,
      tokens: issueAuthTokens({ id: user.id, role: user.role as Role }),
    };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Body() body: RefreshAuthDto) {
    let payload;
    try {
      payload = verifyAuthToken(body.refreshToken, "refresh");
    } catch {
      throw new UnauthorizedException("Session expired or invalid");
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "active" || user.role !== payload.role) {
      throw new UnauthorizedException("Session expired or invalid");
    }
    return issueAuthTokens({ id: user.id, role: user.role as Role });
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  async me(@Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUserId(req) } });
    if (!user) throw new NotFoundError("User not found");
    const jurisdiction = await this.prisma.jurisdiction.findUnique({
      where: { id: user.jurisdictionId },
    });
    return { user, jurisdiction };
  }

  @Patch("me")
  @UseGuards(AccessTokenGuard)
  async updateMe(@Req() req: Request, @Body() body: UpdateProfileDto) {
    const id = currentUserId(req);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
        ...(body.profileDetails !== undefined ? { profileDetails: body.profileDetails } : {}),
      },
    });
    return user;
  }
}

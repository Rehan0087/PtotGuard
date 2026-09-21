import {
  BadRequestException,
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
import { ConflictError, NotFoundError } from "../common/domain-exceptions";
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
    // An invitation is taken up by using it: the first sign-in that works is
    // what turns it into an account. Suspended refuses exactly as before, and
    // an invitation nobody issued a password for has no hash to match.
    if (
      !user ||
      user.status === "suspended" ||
      !verifyPassword(body.password, user.passwordHash)
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (user.status === "invited") {
      await this.prisma.user.update({ where: { id: user.id }, data: { status: "active" } });
      user.status = "active";
    }
    const { passwordHash: _passwordHash, ...safeUser } = user;
    void _passwordHash;
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
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundError("User not found");
    if (current.role === "field-agent" && body.profileDetails !== undefined) {
      throw new BadRequestException("Field agents cannot update managed profile details");
    }
    if (body.email !== undefined && body.email !== current.email) {
      const used = await this.prisma.user.findUnique({ where: { email: body.email } });
      if (used && used.id !== id) {
        throw new ConflictError("This email address is already used by another account", {
          code: "email-in-use",
        });
      }
    }
    const currentDetails =
      current.profileDetails &&
      typeof current.profileDetails === "object" &&
      !Array.isArray(current.profileDetails)
        ? (current.profileDetails as Record<string, unknown>)
        : {};
    const profileDetails =
      body.profileDetails !== undefined ||
      body.currentAddress !== undefined ||
      body.emergencyContact !== undefined
        ? {
            ...currentDetails,
            ...(body.profileDetails ?? {}),
            ...(body.currentAddress !== undefined
              ? { currentAddress: body.currentAddress }
              : {}),
            ...(body.emergencyContact !== undefined
              ? { emergencyContact: body.emergencyContact }
              : {}),
          }
        : undefined;
    let user;
    try {
      user = await this.prisma.user.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
          ...(profileDetails !== undefined ? { profileDetails } : {}),
        },
      });
    } catch (error) {
      const prismaError = error as { code?: string; meta?: { target?: unknown } };
      const target = prismaError.meta?.target;
      if (
        prismaError.code === "P2002" &&
        (target === "email" || (Array.isArray(target) && target.includes("email")))
      ) {
        throw new ConflictError("This email address is already used by another account", {
          code: "email-in-use",
        });
      }
      throw error;
    }
    const { passwordHash: _passwordHash, ...safeUser } = user;
    void _passwordHash;
    return safeUser;
  }
}

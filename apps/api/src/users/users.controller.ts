import { randomUUID } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  passwordResetGate,
  roleChangeGate,
  type Role,
  type UserStatus,
} from "@plotguard/rules";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId, hashPassword, temporaryPassword } from "../auth/dev-current-user";
import { InviteUserDto } from "./invite-user.dto";
import { UpdateUserDto } from "./update-user.dto";

@Controller("users")
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The mutation wizard's recipient picker — additive, and deliberately
   * narrower than `list()` below: a citizen filing a transfer needs to find
   * one specific person they already know how to reach, not browse a
   * directory. Only `role: "citizen"` (land only moves to a private
   * account here, never to an officer's professional one), a minimum query
   * length (so this can't be used to enumerate accounts a few characters at
   * a time), and only `{id, name}` back — the caller already supplied the
   * email or phone fragment that matched, so echoing the name is the only
   * new information this actually reveals.
   *
   * Registered before `:id`-shaped routes would matter, but there are none
   * on this controller yet — kept first anyway since that's where the next
   * one will look for it.
   */
  @Get("search")
  async search(@Query("q") q: string | undefined, @Req() req: Request) {
    const query = (q ?? "").trim();
    if (query.length < 4) return [];

    const actorId = currentUserId(req);
    return this.prisma.user.findMany({
      where: {
        role: "citizen",
        id: { not: actorId },
        OR: [
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query } },
        ],
      },
      take: 5,
      select: { id: true, name: true },
    });
  }

  @Get()
  async list(@Query() query: Record<string, string>) {
    const q = query.q?.toLowerCase();
    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const all = await this.prisma.user.findMany({ where });
    return paginate(all, pageParams(query));
  }

  /**
   * Admin governance — additive to the frozen spec, this controller's
   * first write of any kind. Deliberately narrow: status only moves between
   * active/suspended (never "invited" — there's no invite flow to issue one
   * from) and jurisdiction reassignment, the two account actions that need
   * no real auth system behind them. Role changes and account creation stay
   * out — both need vetting this demo has no way to do honestly.
   */
  /**
   * Guarded per-method rather than per-controller: the two reads below stay
   * open because other portals need them — a mediator lists mediators to hand
   * a case over, a citizen searches for a transfer recipient — while every
   * write here is administration.
   *
   * The guard also fixes who the ledger blames. currentUserId() falls back to
   * the dev role header and defaults to citizen, so an unguarded write from
   * the browser recorded the wrong actor: a verified token identity is what
   * makes the entry true.
   */
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("admin")
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdateUserDto, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("User not found");

    const actorId = currentUserId(req);
    if (body.status === "suspended" && id === actorId) {
      throw new ConflictError("You cannot suspend your own account.");
    }

    // Same reasoning as suspension, through a pure gate this time: an
    // administrator who can demote themselves can lock the registry out of
    // its own administration, and no remaining account could undo it.
    if (body.role) {
      const review = roleChangeGate(actorId, { id: user.id, role: user.role as Role }, body.role);
      if (!review.canChange) throw new ValidationError(review.blockers[0], "role");
    }

    if (body.jurisdictionId) {
      const jurisdiction = await this.prisma.jurisdiction.findUnique({
        where: { id: body.jurisdictionId },
      });
      if (!jurisdiction) throw new NotFoundError("Jurisdiction not found");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(body.jurisdictionId ? { jurisdictionId: body.jurisdictionId } : {}),
          ...(body.role ? { role: body.role } : {}),
        },
      });

      await this.audit.append(tx, {
        entityType: "user",
        entityId: updated.id,
        action: "update",
        actorId,
        payload: {
          name: updated.name,
          ...(body.status ? { status: updated.status } : {}),
          ...(body.jurisdictionId ? { jurisdictionId: updated.jurisdictionId } : {}),
          ...(body.role ? { role: updated.role } : {}),
        },
      });

      return updated;
    });
  }

  /**
   * Creating an account — the gap this controller's own note used to
   * explain away with "no real auth to issue an invite through yet". There
   * is now: passwords are hashed, sign-in is real, and the API refuses to
   * start without a token secret.
   *
   * The account starts `invited`, which until now was a status nothing could
   * produce. It carries a generated password returned to the administrator
   * exactly once, because there is no mail delivery here to send it through
   * — the invitation is handed over, not emailed. Signing in with it is what
   * turns the invitation into an account.
   */
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("admin")
  @Post()
  @HttpCode(201)
  async invite(@Body() body: InviteUserDto, @Req() req: Request) {
    const email = body.email.trim().toLowerCase();
    const [existing, jurisdiction] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.jurisdiction.findUnique({ where: { id: body.jurisdictionId } }),
    ]);
    if (existing) throw new ConflictError("An account with that email already exists.");
    if (!jurisdiction) throw new NotFoundError("Jurisdiction not found");

    const actorId = currentUserId(req);
    const password = temporaryPassword();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          id: `usr-${randomUUID()}`,
          name: body.name.trim(),
          email,
          role: body.role,
          jurisdictionId: body.jurisdictionId,
          ...(body.title?.trim() ? { title: body.title.trim() } : {}),
          status: "invited",
          passwordHash: hashPassword(password),
        },
      });

      await this.audit.append(tx, {
        entityType: "user",
        entityId: created.id,
        action: "create",
        actorId,
        payload: { name: created.name, email: created.email, role: created.role },
      });

      const { passwordHash: _passwordHash, ...safeUser } = created;
      void _passwordHash;
      // Returned once, never stored anywhere readable. Reissue rather than
      // recover it: there is nothing to recover from a hash.
      return { user: safeUser, temporaryPassword: password };
    });
  }

  /**
   * A new temporary password for somebody locked out. Same stand-in as the
   * invitation: handed over, not emailed, and shown once.
   */
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("admin")
  @Post(":id/password-reset")
  @HttpCode(200)
  async resetPassword(@Param("id") id: string, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("User not found");

    const review = passwordResetGate({ status: user.status as UserStatus });
    if (!review.canReset) throw new ValidationError(review.blockers[0], "status");

    const actorId = currentUserId(req);
    const password = temporaryPassword();

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash: hashPassword(password) } });

      await this.audit.append(tx, {
        entityType: "user",
        entityId: id,
        action: "update",
        actorId,
        // The password itself never reaches the ledger; that it changed does.
        payload: { name: user.name, passwordReset: "true" },
      });

      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: id,
          at: new Date(),
          severity: "warning",
          title: "Your password was reset",
          body: "An administrator issued you a new temporary password.",
          content: { code: "password-reset" },
          read: false,
          href: "/profile",
        },
      });

      return { temporaryPassword: password };
    });
  }
}

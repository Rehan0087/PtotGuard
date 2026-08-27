import { Body, Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
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
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdateUserDto, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("User not found");

    const actorId = currentUserId(req);
    if (body.status === "suspended" && id === actorId) {
      throw new ConflictError("You cannot suspend your own account.");
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
        },
      });

      return updated;
    });
  }
}

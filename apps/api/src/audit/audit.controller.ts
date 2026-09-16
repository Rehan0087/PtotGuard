import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { pageParams, paginated } from "../common/pagination";
import { verifyChain } from "./audit-hash";

function one(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * A date-only `to` means the end of that day to the person who typed it, so
 * it becomes an exclusive bound on the following midnight rather than an
 * inclusive one on this day's first instant — otherwise "to the 15th" would
 * silently drop everything that happened on the 15th.
 */
function bound(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

/** Unparseable filters are ignored rather than 400'd — same spirit as pageParams. */
function auditWhere(query: Record<string, unknown>): Prisma.AuditEventWhereInput {
  const from = bound(one(query.from));
  const to = bound(one(query.to), true);
  return {
    ...(one(query.entityType) ? { entityType: one(query.entityType) } : {}),
    ...(one(query.action) ? { action: one(query.action) } : {}),
    ...(one(query.actorId) ? { actorId: one(query.actorId) } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
  };
}

/**
 * The whole ledger, and it is the administrator's: every entry names who
 * did what to which record, which is exactly the trail that should not be
 * readable by whoever asks. The land-office record view builds its own
 * per-parcel history through parcels.controller and does not come here.
 */
@Controller("audit")
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles("admin")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  // Declared before ":entityType/:id" for the same reason field-reports
  // orders "assigned" first — a literal path ahead of any route that could
  // shadow it, even though a two-segment dynamic route couldn't here.
  @Get("verify")
  async verify() {
    // Chain order is createdAt ascending — the order links were appended in.
    // Deliberately unfiltered and unpaged: a page of a chain proves nothing,
    // so verification always walks the whole ledger.
    const events = await this.prisma.auditEvent.findMany({ orderBy: { createdAt: "asc" } });
    return verifyChain(events);
  }

  /** The entity types actually present, so the filter offers real options. */
  @Get("entity-types")
  async entityTypes() {
    const rows = await this.prisma.auditEvent.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    });
    return rows.map((row) => row.entityType);
  }

  /**
   * Full ledger (admin), filtered and paged.
   *
   * This was an unbounded findMany: every event ever written, returned in
   * full on every load, growing for the life of the system. It is now bounded
   * the way every other collection endpoint here is, and carries the filters
   * an auditor actually asks for — which kind of record, which kind of
   * change, by whom, and between when and when.
   */
  @Get()
  async list(@Query() query: Record<string, string>) {
    const params = pageParams(query);
    const where = auditWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return paginated(items, total, params);
  }

  @Get(":entityType/:id")
  forEntity(@Param("entityType") entityType: string, @Param("id") id: string) {
    return this.prisma.auditEvent.findMany({
      where: { entityType, entityId: id },
      orderBy: { createdAt: "desc" },
    });
  }
}

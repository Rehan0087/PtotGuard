import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import type { Request } from "express";
import { OPEN_GRIEVANCE_STATUSES, routeGrievance, shouldEscalateGrievance, type GrievanceStatus, type Jurisdiction } from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError, ForbiddenError } from "../common/domain-exceptions";
import { currentUserId, type AuthenticatedRequest } from "../auth/dev-current-user";
import { CreateGrievanceDto } from "./create-grievance.dto";
import { UpdateGrievanceStatusDto } from "./update-grievance-status.dto";
import { ResolveGrievanceDto } from "./resolve-grievance.dto";
import { RateGrievanceDto } from "./rate-grievance.dto";

/**
 * Only the officer a grievance is routed to (or the supervisor it was
 * escalated to) may move it — an admin may always step in. A staff-conduct
 * complaint must never be closable by any other officer in the office.
 */
function assertHandler(
  grievance: { assignedOfficerId: string | null; escalatedToId: string | null },
  req: Request,
): void {
  const user = (req as AuthenticatedRequest).user;
  if (user?.role === "admin") return;
  if (user && (grievance.assignedOfficerId === user.id || grievance.escalatedToId === user.id)) return;
  throw new ForbiddenError("This grievance is not assigned to you");
}

@Controller("grievances")
export class GrievancesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async findAll(@Req() req: Request) {
    await this.escalateOverdue();
    const userId = currentUserId(req);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    if (user.role === "citizen") {
      return this.prisma.grievance.findMany({
        where: { filedById: userId },
        orderBy: { createdAt: "desc" },
      });
    } else {
      return this.prisma.grievance.findMany({
        where: { OR: [{ assignedOfficerId: userId }, { escalatedToId: userId }] },
        orderBy: { createdAt: "desc" },
      });
    }
  }

  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req: Request) {
    await this.escalateOverdue();
    const grievance = await this.prisma.grievance.findUnique({
      where: { id },
      include: {
        events: { orderBy: { at: "asc" } },
      },
    });
    if (!grievance) throw new NotFoundError("Grievance not found");

    const userId = currentUserId(req);
    if (grievance.filedById !== userId && grievance.assignedOfficerId !== userId && grievance.escalatedToId !== userId) {
      // Basic check, might need wider access for admins, but restricting to involved parties
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.role !== "admin") {
        throw new ForbiddenError("Not authorized to view this grievance");
      }
    }

    return {
      grievance,
      timeline: grievance.events,
    };
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("citizen")
  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateGrievanceDto, @Req() req: Request) {
    const actorId = currentUserId(req);
    const filer = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!filer) throw new NotFoundError("User not found");

    const [officers, admins, jurisdictions] = await Promise.all([
      this.prisma.user.findMany({ where: { role: "land-office", status: "active" }, orderBy: { id: "asc" } }),
      this.prisma.user.findMany({ where: { role: "admin", status: "active" }, orderBy: { id: "asc" } }),
      this.prisma.jurisdiction.findMany(),
    ]);
    const { assignedOfficerId, escalatedToId } = routeGrievance(
      body.category,
      filer.jurisdictionId,
      officers,
      admins,
      jurisdictions as unknown as Jurisdiction[],
    );

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const last = await tx.grievance.findFirst({
        orderBy: { caseNumber: "desc" },
      });
      
      let nextSeq = 1000;
      if (last && last.caseNumber.startsWith("GRV-2026-")) {
        const match = last.caseNumber.match(/GRV-2026-(\d+)/);
        if (match && match[1]) {
          nextSeq = parseInt(match[1], 10) + 1;
        }
      }
      if (nextSeq === 1000) {
        const count = await tx.grievance.count();
        nextSeq = 1000 + count;
      }
      
      const caseNumber = `GRV-2026-${String(nextSeq).padStart(5, "0")}`;

      const slaDeadline = new Date(now);
      slaDeadline.setDate(slaDeadline.getDate() + 7);

      const created = await tx.grievance.create({
        data: {
          id: `grv-${randomUUID()}`,
          caseNumber,
          category: body.category,
          status: "submitted",
          description: body.description,
          filedById: filer.id,
          filedByName: filer.name,
          assignedOfficerId,
          escalatedToId,
          slaDeadline,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.audit.append(tx, {
        entityType: "grievance",
        entityId: created.id,
        action: "create",
        actorId,
        payload: {
          caseNumber: created.caseNumber,
          category: created.category,
        },
      });

      await tx.grievanceEvent.create({
        data: {
          id: `ge-${randomUUID()}`,
          grievanceId: created.id,
          at: now,
          type: "filed",
          title: "Grievance filed",
          actorId,
        },
      });

      if (filer.role === "citizen") {
        await tx.appNotification.create({
          data: {
            id: `n-${randomUUID()}`,
            userId: filer.id,
            at: now,
            severity: "success",
            title: "Grievance submitted",
            body: `Your complaint ${created.caseNumber} has been successfully submitted.`,
            read: false,
            href: `/grievances/${created.id}`,
          },
        });
      }

      const assignedTo = assignedOfficerId || escalatedToId;
      if (assignedTo) {
        await tx.appNotification.create({
          data: {
            id: `n-${randomUUID()}`,
            userId: assignedTo,
            at: now,
            severity: "info",
            title: "New grievance assigned",
            body: `${created.caseNumber} requires your review.`,
            read: false,
            href: `/grievances/${created.id}`,
          },
        });
      }

      return created;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office", "admin")
  @Patch(":id/status")
  async updateStatus(
    @Param("id") id: string,
    @Body() body: UpdateGrievanceStatusDto,
    @Req() req: Request,
  ) {
    const grievance = await this.prisma.grievance.findUnique({ where: { id } });
    if (!grievance) throw new NotFoundError("Grievance not found");
    assertHandler(grievance, req);

    if (["resolved", "dismissed"].includes(grievance.status)) {
      throw new ConflictError("This grievance has already been decided.");
    }

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.grievance.update({
        where: { id },
        data: { status: body.status, updatedAt: now },
      });

      await this.audit.append(tx, {
        entityType: "grievance",
        entityId: updated.id,
        action: "status-change",
        actorId,
        payload: { from: grievance.status, to: body.status },
      });

      await tx.grievanceEvent.create({
        data: {
          id: `ge-${randomUUID()}`,
          grievanceId: updated.id,
          at: now,
          type: "status-change",
          title: "Status updated",
          description: `Status changed to ${body.status}`,
          actorId,
        },
      });

      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: grievance.filedById,
          at: now,
          severity: "info",
          title: "Grievance status updated",
          body: `Complaint ${grievance.caseNumber} status was updated to ${body.status}.`,
          read: false,
          href: `/grievances/${grievance.id}`,
        },
      });

      return updated;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office", "admin")
  @Patch(":id/resolve")
  async resolve(
    @Param("id") id: string,
    @Body() body: ResolveGrievanceDto,
    @Req() req: Request,
  ) {
    const grievance = await this.prisma.grievance.findUnique({ where: { id } });
    if (!grievance) throw new NotFoundError("Grievance not found");
    assertHandler(grievance, req);

    if (["resolved", "dismissed"].includes(grievance.status)) {
      throw new ConflictError("This grievance has already been decided.");
    }

    const actorId = currentUserId(req);
    const newStatus = body.dismissed ? "dismissed" : "resolved";

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.grievance.update({
        where: { id },
        data: { 
          status: newStatus, 
          resolutionNote: body.resolutionNote,
          resolvedAt: now,
          updatedAt: now 
        },
      });

      await this.audit.append(tx, {
        entityType: "grievance",
        entityId: updated.id,
        action: "ruling",
        actorId,
        payload: { outcome: newStatus },
      });

      await tx.grievanceEvent.create({
        data: {
          id: `ge-${randomUUID()}`,
          grievanceId: updated.id,
          at: now,
          type: newStatus,
          title: body.dismissed ? "Grievance dismissed" : "Grievance resolved",
          description: body.resolutionNote,
          actorId,
        },
      });

      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: grievance.filedById,
          at: now,
          severity: body.dismissed ? "warning" : "success",
          title: `Grievance ${newStatus}`,
          body: `Complaint ${grievance.caseNumber} has been ${newStatus}.`,
          read: false,
          href: `/grievances/${grievance.id}`,
        },
      });

      return updated;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("citizen")
  @Patch(":id/rate")
  async rate(
    @Param("id") id: string,
    @Body() body: RateGrievanceDto,
    @Req() req: Request,
  ) {
    const grievance = await this.prisma.grievance.findUnique({ where: { id } });
    if (!grievance) throw new NotFoundError("Grievance not found");

    const actorId = currentUserId(req);
    if (grievance.filedById !== actorId) {
      throw new ForbiddenError("Only the filer can rate the grievance");
    }

    if (!["resolved", "dismissed"].includes(grievance.status)) {
      throw new ConflictError("Grievance must be resolved or dismissed before rating.");
    }

    if (grievance.satisfactionRating != null) {
      throw new ConflictError("Grievance has already been rated.");
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.grievance.update({
        where: { id },
        data: { satisfactionRating: body.rating, updatedAt: now },
      });

      await this.audit.append(tx, {
        entityType: "grievance",
        entityId: updated.id,
        action: "update",
        actorId,
        payload: { satisfactionRating: body.rating },
      });

      await tx.grievanceEvent.create({
        data: {
          id: `ge-${randomUUID()}`,
          grievanceId: updated.id,
          at: now,
          type: "rated",
          title: "Rating submitted",
          description: `Citizen rated resolution: ${body.rating} stars`,
          actorId,
        },
      });

      return updated;
    });
  }

  /**
   * Sends every open grievance past its response deadline over the office's
   * head. There is no job scheduler here, so this runs before any grievance
   * is read — nobody can see one without it having been swept first. Each
   * escalation is a conditional update, so two concurrent reads escalate a
   * grievance once.
   */
  private async escalateOverdue(now: Date = new Date()) {
    const overdue = await this.prisma.grievance.findMany({
      where: {
        status: { in: OPEN_GRIEVANCE_STATUSES },
        escalatedToId: null,
        slaDeadline: { lt: now },
      },
    });
    const due = overdue.filter((g) =>
      shouldEscalateGrievance({ ...g, status: g.status as GrievanceStatus }, now),
    );
    if (due.length === 0) return;

    const admin = await this.prisma.user.findFirst({
      where: { role: "admin", status: "active" },
      orderBy: { id: "asc" },
    });
    if (!admin) return;

    for (const grievance of due) {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.grievance.updateMany({
          where: { id: grievance.id, escalatedToId: null, status: { in: OPEN_GRIEVANCE_STATUSES } },
          data: { status: "escalated", escalatedToId: admin.id, escalatedAt: now, updatedAt: now },
        });
        if (count === 0) return;

        await tx.grievanceEvent.create({
          data: {
            id: `ge-${randomUUID()}`,
            grievanceId: grievance.id,
            at: now,
            type: "escalated",
            title: "Escalated — response deadline missed",
            description: `No resolution by the deadline, so the complaint was passed to ${admin.name}.`,
            actorName: "System",
          },
        });
        await this.audit.append(tx, {
          entityType: "grievance",
          entityId: grievance.id,
          action: "status-change",
          actorId: admin.id,
          payload: { from: grievance.status, to: "escalated", reason: "sla-missed", automatic: true },
        });
        for (const notice of [
          { userId: admin.id, severity: "warning", title: "Grievance escalated to you", body: `${grievance.caseNumber} missed its response deadline and needs your attention.` },
          { userId: grievance.filedById, severity: "info", title: "Your complaint was escalated", body: `${grievance.caseNumber} was not resolved in time, so it has been passed to an administrator.` },
        ]) {
          await tx.appNotification.create({
            data: { id: `n-${randomUUID()}`, at: now, read: false, href: `/grievances/${grievance.id}`, ...notice },
          });
        }
      });
    }
  }
}

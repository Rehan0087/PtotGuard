import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { ServiceType } from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";
import { CreateServiceApplicationDto } from "./create-service-application.dto";
import { RecordPaymentDto } from "./record-payment.dto";
import { ServiceApplicationDecisionDto } from "./service-application-decision.dto";

/** The prefix names the service on every application number it issues. */
const APPLICATION_PREFIX: Record<ServiceType, string> = {
  "land-tax": "LDT",
  acquisition: "ACQ",
  "lease-settlement": "LSE",
  "land-admin": "ADM",
  "revenue-case": "RVC",
  "info-bank-request": "INF",
};

/**
 * Shared foundation for the six services this model stands in for — see
 * ServiceApplication in @plotguard/rules. No screen calls this controller
 * yet; each service (Land Development Tax, Acquisition & Requisition, ...)
 * gets a thin screen of its own later, composed on these same four writes.
 * Mutation (e-Namjari) is not one of them — see mutations.controller.ts.
 */
@Controller("service-applications")
export class ServiceApplicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const me = currentUserId(req);
    const where = {
      ...(query.scope === "mine" ? { applicantId: me } : {}),
      ...(query.scope === "assigned" ? { assignedOfficerId: me } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const all = await this.prisma.serviceApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundError("Service application not found");

    const [timeline, parcel] = await Promise.all([
      this.prisma.serviceApplicationEvent.findMany({
        where: { applicationId: id },
        orderBy: { at: "asc" },
      }),
      application.parcelId ? findParcelView(this.prisma, application.parcelId) : null,
    ]);

    return { application, timeline, parcel };
  }

  /** Starts a draft. No gate: a citizen may open one before deciding every
   * field, the same way a form draft is never refused for being incomplete. */
  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateServiceApplicationDto, @Req() req: Request) {
    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      // Same fragile-but-consistent numbering as disputes/mutations
      // elsewhere in this codebase: a running count, not a DB sequence.
      const count = await tx.serviceApplication.count({
        where: { serviceType: body.serviceType },
      });
      const applicationNo = `${APPLICATION_PREFIX[body.serviceType]}-2026-${String(1000 + count).padStart(6, "0")}`;
      const now = new Date();

      const created = await tx.serviceApplication.create({
        data: {
          id: `sa-${randomUUID()}`,
          applicationNo,
          serviceType: body.serviceType,
          status: "draft",
          parcelId: body.parcelId,
          applicantId: actorId,
          details: (body.details ?? {}) as never,
          documentIds: [],
        },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: created.id,
        action: "create",
        actorId,
        payload: { applicationNo: created.applicationNo, serviceType: created.serviceType },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: created.id,
          at: now,
          type: "created",
          title: "Application started",
          actorId,
        },
      });

      return created;
    });
  }

  /** draft → submitted. A citizen may revise a draft freely, so this is the
   * only transition guarded against direction rather than content: it just
   * cannot fire twice. */
  @Patch(":id/submit")
  async submit(@Param("id") id: string, @Req() req: Request) {
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundError("Service application not found");
    if (application.status !== "draft") {
      throw new ConflictError("This application has already been submitted.");
    }

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.serviceApplication.update({
        where: { id },
        data: { status: "submitted", submittedAt: now },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: updated.id,
        action: "status-change",
        actorId,
        payload: { applicationNo: updated.applicationNo, status: updated.status },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: updated.id,
          at: now,
          type: "submitted",
          title: "Application submitted",
          actorId,
        },
      });

      return updated;
    });
  }

  /**
   * Simulated — no gateway is called, the same stand-in as Mutation's own
   * payment recording. Must follow submit (an application still being
   * drafted has nothing to charge for yet) and can only happen once.
   */
  @Patch(":id/pay")
  async pay(@Param("id") id: string, @Body() body: RecordPaymentDto, @Req() req: Request) {
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundError("Service application not found");
    if (!application.submittedAt) {
      throw new ValidationError({ code: "not-submitted" }, "status");
    }
    if (application.paidAt) {
      throw new ConflictError("This application has already been paid.");
    }

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.serviceApplication.update({
        where: { id },
        data: {
          status: "under-review",
          paymentMethod: body.paymentMethod,
          transactionId: `TXN-${randomUUID().slice(0, 8).toUpperCase()}`,
          paidAt: now,
        },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: updated.id,
        action: "payment",
        actorId,
        payload: { applicationNo: updated.applicationNo, paymentMethod: updated.paymentMethod },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: updated.id,
          at: now,
          type: "payment-recorded",
          title: "Payment recorded",
          actorId,
        },
      });

      return updated;
    });
  }

  /** Officer approval/rejection. Guards the same shape as Mutation's decide()
   * and Hearing's issueRuling(): a closed application takes no further
   * decision, checked before any rule since there is no rule content to
   * evaluate here yet — see the module doc comment for why. */
  @Patch(":id/decision")
  async decide(
    @Param("id") id: string,
    @Body() body: ServiceApplicationDecisionDto,
    @Req() req: Request,
  ) {
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundError("Service application not found");
    if (application.status === "draft") {
      throw new ValidationError({ code: "not-submitted" }, "status");
    }
    if (application.status === "approved" || application.status === "rejected") {
      throw new ConflictError("This application has already been decided.");
    }

    const actorId = currentUserId(req);
    const status = body.decision === "approve" ? "approved" : "rejected";

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.serviceApplication.update({
        where: { id },
        data: { status, decidedAt: now },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: updated.id,
        action: body.decision,
        actorId,
        payload: { applicationNo: updated.applicationNo, status: updated.status },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: updated.id,
          at: now,
          type: "decided",
          title: body.decision === "approve" ? "Application approved" : "Application rejected",
          actorId,
        },
      });

      return updated;
    });
  }
}

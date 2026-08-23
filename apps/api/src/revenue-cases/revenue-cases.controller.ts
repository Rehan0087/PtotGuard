import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { FileRevenueCaseDto } from "./file-revenue-case.dto";
import { ScheduleHearingDto } from "./schedule-hearing.dto";

const CLOSED_STATUSES = new Set(["approved", "rejected", "withdrawn"]);

/**
 * Miscellaneous cases and appeals before AC Land / ADC Revenue — citizen vs.
 * government, not the mediator-run citizen-vs-citizen track Disputes/Hearing
 * cover. Filing stamps a flat fee and creates the application already
 * submitted, same shape as land-admin. Paying and the final decision reuse
 * ServiceApplicationsController's generic endpoints unchanged.
 *
 * The one genuinely new step is scheduling a hearing: not a separate model
 * (the existing Hearing model is Dispute-only, built for multi-session
 * mediation with attendance-gated rulings — a different problem), just a
 * status the application moves through plus a date in `details`.
 */
@Controller("revenue-cases")
export class RevenueCasesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post("file")
  @HttpCode(201)
  async file(@Body() body: FileRevenueCaseDto, @Req() req: Request) {
    const me = currentUserId(req);
    const [parcel, policy] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId } }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (!policy) throw new NotFoundError("Policies not configured");
    // Same answer for "no such parcel" and "not yours" as land-admin's own
    // apply(): filing a case is the owner's to do, and distinguishing the
    // two would confirm a stranger's holding.
    if (parcel.ownerId !== me) throw new NotFoundError("Parcel not found");

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.serviceApplication.count({ where: { serviceType: "revenue-case" } });
      const applicationNo = `RVC-2026-${String(1000 + count).padStart(6, "0")}`;
      const now = new Date();

      const created = await tx.serviceApplication.create({
        data: {
          id: `sa-${randomUUID()}`,
          applicationNo,
          serviceType: "revenue-case",
          status: "submitted",
          parcelId: parcel.id,
          applicantId: me,
          details: {
            caseType: body.caseType,
            grounds: body.grounds,
            againstReference: body.againstReference,
          } as never,
          documentIds: body.documentIds ?? [],
          feeAmount: policy.revenueCaseFilingFeeBdt,
          submittedAt: now,
        },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: created.id,
        action: "create",
        actorId: me,
        payload: {
          applicationNo: created.applicationNo,
          serviceType: "revenue-case",
          parcelDagNo: parcel.dagNo,
          caseType: body.caseType,
        },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: created.id,
          at: now,
          type: "submitted",
          title:
            body.caseType === "appeal" ? "Appeal case filed" : "Miscellaneous case filed",
          actorId: me,
        },
      });

      return created;
    });
  }

  /**
   * The one transition none of the other services on this model needed.
   * Callable again while already `hearing-scheduled` so a date can be
   * corrected without a separate reschedule endpoint.
   */
  @Patch(":id/schedule-hearing")
  async scheduleHearing(
    @Param("id") id: string,
    @Body() body: ScheduleHearingDto,
    @Req() req: Request,
  ) {
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundError("Service application not found");
    if (!application.paidAt) {
      throw new ValidationError({ code: "not-paid" }, "status");
    }
    if (CLOSED_STATUSES.has(application.status)) {
      throw new ConflictError("This case has already been decided.");
    }

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const details = { ...(application.details as Record<string, unknown>), hearingAt: body.hearingAt };
      const updated = await tx.serviceApplication.update({
        where: { id },
        data: { status: "hearing-scheduled", details: details as never },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: updated.id,
        action: "status-change",
        actorId,
        payload: { applicationNo: updated.applicationNo, status: updated.status, hearingAt: body.hearingAt },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: updated.id,
          at: now,
          type: "status-change",
          title: "Hearing scheduled",
          actorId,
        },
      });

      return updated;
    });
  }
}

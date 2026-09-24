import { randomUUID } from "node:crypto";
import {
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { Policy, ServiceApplication } from "@prisma/client";
import { assessLandTax, type Area, type LandTaxRates, type LandUse } from "@plotguard/rules";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { FileRevenueCaseDto } from "./file-revenue-case.dto";
import { ScheduleHearingDto } from "./schedule-hearing.dto";
import { AssignRevenueCaseDto } from "./assign-revenue-case.dto";
import { coveredJurisdictionIds, loadMutationActor } from "../mutations/mutation-access";

const CLOSED_STATUSES = new Set(["approved", "rejected", "withdrawn"]);

function ratesFrom(policy: Policy): LandTaxRates {
  return {
    perDecimalByLandUse: (policy.landTaxRatePerDecimalBdt ?? {}) as LandTaxRates["perDecimalByLandUse"],
    agriculturalExemptionDecimals: policy.landTaxAgriculturalExemptionDecimals,
    arrearSurchargePercent: policy.landTaxArrearSurchargePercent,
    maxArrearYears: policy.landTaxMaxArrearYears,
  };
}

function paidThroughYear(paid: ServiceApplication[]): number | null {
  const years = paid.map((item) => Number((item.details as { assessmentYear?: number }).assessmentYear))
    .filter(Number.isFinite);
  return years.length ? Math.max(...years) : null;
}

/**
 * Tax-default cases filed by the land office against the owner of an unpaid
 * holding. The citizen is stored as applicant/subject so the existing "mine"
 * query is also their case inbox; the filing officer is the assigned officer.
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
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  async file(@Body() body: FileRevenueCaseDto, @Req() req: Request) {
    const officer = await loadMutationActor(this.prisma, req);
    const [parcel, policy, jurisdictions, paid, existing] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId }, include: { owner: true } }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
      this.prisma.jurisdiction.findMany(),
      this.prisma.serviceApplication.findMany({
        where: { parcelId: body.parcelId, serviceType: "land-tax", paidAt: { not: null } },
      }),
      this.prisma.serviceApplication.findFirst({
        where: {
          parcelId: body.parcelId,
          serviceType: "revenue-case",
          status: { notIn: ["approved", "rejected", "withdrawn"] },
        },
      }),
    ]);
    if (!parcel || !coveredJurisdictionIds(officer, jurisdictions).has(parcel.jurisdictionId)) {
      throw new NotFoundError("Parcel not found");
    }
    if (!policy) throw new NotFoundError("Policies not configured");
    if (existing) throw new ConflictError("An active revenue case already exists for this holding.");

    const year = new Date().getUTCFullYear();
    const settled = paidThroughYear(paid);
    const assessment = assessLandTax({
      area: parcel.area as unknown as Area,
      landUse: parcel.landUse as LandUse,
      assessmentYear: year,
      paidThroughYear: settled,
      liableFromYear: parcel.registeredAt.getUTCFullYear(),
    }, ratesFrom(policy));
    if (assessment.total <= 0 || (settled !== null && settled >= year)) {
      throw new ConflictError("A revenue case can only be filed for outstanding land tax.");
    }

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
          applicantId: parcel.ownerId,
          assignedOfficerId: officer.id,
          details: {
            caseType: "tax-default",
            grounds: body.grounds,
            assessmentYear: year,
            amountDue: assessment.total,
            paidThroughYear: settled,
            ownerName: parcel.owner.name,
            dagNo: parcel.dagNo,
          } as never,
          documentIds: [],
          submittedAt: now,
        },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: created.id,
        action: "create",
        actorId: officer.id,
        payload: {
          applicationNo: created.applicationNo,
          serviceType: "revenue-case",
          parcelDagNo: parcel.dagNo,
          caseType: "tax-default",
          ownerId: parcel.ownerId,
          assessmentYear: year,
          amountDue: assessment.total,
        },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: created.id,
          at: now,
          type: "submitted",
          title: "Revenue case filed for unpaid land tax",
          actorId: officer.id,
        },
      });

      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: parcel.ownerId,
          at: now,
          severity: "critical",
          title: "Revenue case filed for unpaid land tax",
          body: `The land office filed case ${created.applicationNo} for BDT ${assessment.total} due on dag ${parcel.dagNo}.`,
          content: { code: "revenue-case-filed", caseNumber: created.applicationNo, dagNo: parcel.dagNo, amount: assessment.total },
          read: false,
          href: `/revenue-cases`,
        },
      });

      return created;
    });
  }

  /** Land office hands a newly filed tax case to an active settlement officer. */
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  @Patch(":id/assign")
  async assign(
    @Param("id") id: string,
    @Body() body: AssignRevenueCaseDto,
    @Req() req: Request,
  ) {
    const actorId = currentUserId(req);
    const [application, mediator] = await Promise.all([
      this.prisma.serviceApplication.findUnique({ where: { id } }),
      this.prisma.user.findUnique({ where: { id: body.mediatorId } }),
    ]);
    if (!application || application.serviceType !== "revenue-case" || application.assignedOfficerId !== actorId) {
      throw new NotFoundError("Revenue case not found");
    }
    if (!mediator || mediator.role !== "mediator" || mediator.status !== "active") {
      throw new NotFoundError("Settlement officer not found");
    }
    if (application.assignedMediatorId) throw new ConflictError("This case has already been assigned.");

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.serviceApplication.update({
        where: { id },
        data: { assignedMediatorId: mediator.id, status: "under-review" },
      });
      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: id,
        action: "assigned",
        actorId,
        payload: { applicationNo: application.applicationNo, mediatorId: mediator.id },
      });
      await tx.serviceApplicationEvent.create({
        data: { id: `sae-${randomUUID()}`, applicationId: id, at: now, type: "status-change", title: `Assigned to ${mediator.name}`, actorId },
      });
      await tx.appNotification.create({
        data: { id: `ntf-${randomUUID()}`, userId: mediator.id, at: now, severity: "warning", title: "Revenue case assigned", body: `${application.applicationNo} requires your review.`, read: false, href: "/cases" },
      });
      return updated;
    });
  }

  /**
   * The one transition none of the other services on this model needed.
   * Callable again while already `hearing-scheduled` so a date can be
   * corrected without a separate reschedule endpoint.
   */
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("mediator")
  @Patch(":id/schedule-hearing")
  async scheduleHearing(
    @Param("id") id: string,
    @Body() body: ScheduleHearingDto,
    @Req() req: Request,
  ) {
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundError("Service application not found");
    if (application.serviceType !== "revenue-case") throw new NotFoundError("Revenue case not found");
    if (CLOSED_STATUSES.has(application.status)) {
      throw new ConflictError("This case has already been decided.");
    }

    const actorId = currentUserId(req);
    if (application.assignedMediatorId !== actorId) throw new NotFoundError("Revenue case not found");

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

      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: updated.applicantId,
          at: now,
          title: `Hearing scheduled for ${updated.applicationNo}`,
          body: `Hearing scheduled for ${updated.applicationNo}`,
          read: false,
          href: `/revenue-cases`,
        },
      });

      return updated;
    });
  }

  /** Settlement officer asks the citizen to contact/attend without changing case state. */
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("mediator")
  @Post(":id/notify-citizen")
  @HttpCode(201)
  async notifyCitizen(@Param("id") id: string, @Req() req: Request) {
    const actorId = currentUserId(req);
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application || application.serviceType !== "revenue-case" || application.assignedMediatorId !== actorId) {
      throw new NotFoundError("Revenue case not found");
    }
    if (CLOSED_STATUSES.has(application.status)) throw new ConflictError("This case has already been decided.");
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const notification = await tx.appNotification.create({
        data: { id: `ntf-${randomUUID()}`, userId: application.applicantId, at: now, severity: "warning", title: "Settlement officer requested contact", body: `Please contact the settlement office regarding revenue case ${application.applicationNo}.`, read: false, href: "/revenue-cases" },
      });
      await this.audit.append(tx, { entityType: "service-application", entityId: id, action: "citizen-notified", actorId, payload: { applicationNo: application.applicationNo } });
      return notification;
    });
  }
}

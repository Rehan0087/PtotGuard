import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, Post, Req, Patch, Param, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import type { Request } from "express";
import type { Policy } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { ApplyLeaseSettlementDto } from "./apply-lease-settlement.dto";
import { RecordPaymentDto } from "../service-applications/record-payment.dto";

function feeFor(landUse: string, policy: Policy): number {
  return landUse === "agricultural"
    ? policy.leaseSettlementAgriculturalFeeBdt
    : policy.leaseSettlementNonAgriculturalFeeBdt;
}

/**
 * Applications to settle (lease) khas — government — land, agricultural or
 * non-agricultural. Unlike every other service on this model, there is no
 * parcel to look up: khas land isn't in the `Parcel` table (no vacant or
 * state-held row exists anywhere in this schema), so the citizen describes
 * what they're applying for in `locationDescription` instead of picking
 * from something they own. No ownership check, no duplicate-request guard —
 * neither has a natural anchor without a parcelId.
 *
 * Same shape as land-admin/revenue-cases otherwise: a flat fee (by land
 * use, not computed), the application created already `submitted`, and
 * paying/deciding reuse ServiceApplicationsController's generic endpoints
 * unchanged.
 */
@Controller("lease-settlement")
export class LeaseSettlementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("citizen")
  @Post("apply")
  @HttpCode(201)
  async apply(@Body() body: ApplyLeaseSettlementDto, @Req() req: Request) {
    const me = currentUserId(req);
    const policy = await this.prisma.policy.findUnique({ where: { id: "singleton" } });
    if (!policy) throw new NotFoundError("Policies not configured");

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.serviceApplication.count({ where: { serviceType: "lease-settlement" } });
      const applicationNo = `LSE-2026-${String(1000 + count).padStart(6, "0")}`;
      const now = new Date();

      if (body.khasPlotId) {
        const plot = await tx.khasLandPlot.findUnique({ where: { id: body.khasPlotId } });
        if (!plot) throw new NotFoundError("Khas land plot not found");
        if (plot.status !== "available") throw new Error("Plot is not available for lease");

        await tx.khasLandPlot.update({
          where: { id: body.khasPlotId },
          data: { status: "reserved" },
        });
      }

      const created = await tx.serviceApplication.create({
        data: {
          id: `sa-${randomUUID()}`,
          applicationNo,
          serviceType: "lease-settlement",
          status: "submitted",
          parcelId: null,
          khasPlotId: body.khasPlotId ?? null,
          applicantId: me,
          details: {
            landUse: body.landUse,
            locationDescription: body.locationDescription,
            areaDecimals: body.areaDecimals,
            termYears: body.termYears,
            purpose: body.purpose,
            leaseFeeAmount: feeFor(body.landUse, policy),
          } as never,
          documentIds: body.documentIds ?? [],
          feeAmount: policy.leaseSettlementApplicationFeeBdt,
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
          serviceType: "lease-settlement",
          landUse: body.landUse,
        },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: created.id,
          at: now,
          type: "submitted",
          title:
            body.landUse === "agricultural"
              ? "Agricultural settlement requested"
              : "Non-agricultural settlement requested",
          actorId: me,
        },
      });

      return created;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("citizen")
  @Patch(":id/pay-lease")
  async payLease(@Param("id") id: string, @Body() body: RecordPaymentDto, @Req() req: Request) {
    const me = currentUserId(req);
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application || application.applicantId !== me) throw new NotFoundError("Application not found");
    if (application.serviceType !== "lease-settlement") throw new Error("Invalid application type");
    if (application.status !== "approved") throw new Error("Lease must be approved before payment");

    const details = application.details as Record<string, any>;
    if (details.leaseFeePaidAt) throw new Error("Lease fee already paid");

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const updated = await tx.serviceApplication.update({
        where: { id },
        data: {
          details: {
            ...details,
            leaseFeePaidAt: now.toISOString(),
            leaseFeePaymentMethod: body.paymentMethod,
            leaseExpiresAt: expiresAt.toISOString(),
          } as never,
        },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: id,
        action: "payment",
        actorId: me,
        payload: { event: "lease-fee-paid" },
      });

      return updated;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("citizen")
  @Patch(":id/renew")
  async renewLease(@Param("id") id: string, @Req() req: Request) {
    const me = currentUserId(req);
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application || application.applicantId !== me) throw new NotFoundError("Application not found");
    if (application.serviceType !== "lease-settlement") throw new Error("Invalid application type");
    
    const details = application.details as Record<string, any>;
    if (!details.leaseFeePaidAt) throw new Error("Initial lease fee must be paid before renewal");

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const currentExpiresAt = details.leaseExpiresAt ? new Date(details.leaseExpiresAt) : now;
      
      // If already expired, renew from now. If active, extend by 1 year from expiry.
      const baseDate = currentExpiresAt < now ? now : currentExpiresAt;
      const newExpiresAt = new Date(baseDate);
      newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

      const updated = await tx.serviceApplication.update({
        where: { id },
        data: {
          details: {
            ...details,
            leaseExpiresAt: newExpiresAt.toISOString(),
          } as never,
        },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: id,
        action: "update",
        actorId: me,
        payload: { event: "lease-renewed", newExpiresAt },
      });

      return updated;
    });
  }
}

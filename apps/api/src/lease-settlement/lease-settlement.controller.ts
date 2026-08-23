import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type { Policy } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { ApplyLeaseSettlementDto } from "./apply-lease-settlement.dto";

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

      const created = await tx.serviceApplication.create({
        data: {
          id: `sa-${randomUUID()}`,
          applicationNo,
          serviceType: "lease-settlement",
          status: "submitted",
          parcelId: null,
          applicantId: me,
          details: {
            landUse: body.landUse,
            locationDescription: body.locationDescription,
            areaDecimals: body.areaDecimals,
            termYears: body.termYears,
            purpose: body.purpose,
          } as never,
          documentIds: body.documentIds ?? [],
          feeAmount: feeFor(body.landUse, policy),
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
}

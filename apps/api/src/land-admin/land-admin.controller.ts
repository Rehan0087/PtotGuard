import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type { Policy, ServiceApplication } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { ApplyLandAdminDto } from "./apply-land-admin.dto";

const OPEN_STATUSES = new Set(["submitted", "payment-pending", "under-review", "field-investigation"]);

function feeFor(requestType: string, policy: Policy): number {
  return requestType === "certified-copy"
    ? policy.landAdminCertifiedCopyFeeBdt
    : policy.landAdminCorrectionFeeBdt;
}

/** True if an open (undecided) request of the same type already exists on this parcel. */
function hasOpenRequest(
  existing: ServiceApplication[],
  parcelId: string,
  requestType: string,
): boolean {
  return existing.some(
    (a) =>
      a.parcelId === parcelId &&
      OPEN_STATUSES.has(a.status) &&
      (a.details as { requestType?: string })?.requestType === requestType,
  );
}

/**
 * Certified copies and record-correction requests — the two Land
 * Administration workflows. Unlike Land Tax, what's owed here is a flat fee
 * by request type, not a computed assessment, so there's no wrapping rule in
 * @plotguard/rules — same as Policy.mutationFeeBdt, which has never needed
 * one either.
 *
 * This is the only bespoke endpoint the feature needs. Once an application
 * exists, paying it and having an officer decide it reuse
 * ServiceApplicationsController's PATCH .../pay and .../decision unchanged —
 * this just stamps the fee and creates the application already `submitted`,
 * since a one-field-form request has no draft worth saving.
 */
@Controller("land-admin")
export class LandAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post("apply")
  @HttpCode(201)
  async apply(@Body() body: ApplyLandAdminDto, @Req() req: Request) {
    const me = currentUserId(req);
    const [parcel, policy, existing] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId } }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
      this.prisma.serviceApplication.findMany({
        where: { applicantId: me, serviceType: "land-admin" },
      }),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (!policy) throw new NotFoundError("Policies not configured");
    // Same answer for "no such parcel" and "not yours": a record request is
    // the owner's to make, and distinguishing the two would confirm a
    // stranger's holding.
    if (parcel.ownerId !== me) throw new NotFoundError("Parcel not found");

    if (hasOpenRequest(existing, parcel.id, body.requestType)) {
      throw new ConflictError(
        body.requestType === "certified-copy"
          ? "A certified-copy request for this parcel is already in progress."
          : "A correction request for this parcel is already in progress.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.serviceApplication.count({ where: { serviceType: "land-admin" } });
      const applicationNo = `ADM-2026-${String(1000 + count).padStart(6, "0")}`;
      const now = new Date();

      const created = await tx.serviceApplication.create({
        data: {
          id: `sa-${randomUUID()}`,
          applicationNo,
          serviceType: "land-admin",
          status: "submitted",
          parcelId: parcel.id,
          applicantId: me,
          details: {
            requestType: body.requestType,
            correctionType: body.correctionType,
            currentValue: body.currentValue,
            correctedValue: body.correctedValue,
            reason: body.reason,
          } as never,
          documentIds: body.documentIds ?? [],
          feeAmount: feeFor(body.requestType, policy),
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
          serviceType: "land-admin",
          parcelDagNo: parcel.dagNo,
          requestType: body.requestType,
        },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: created.id,
          at: now,
          type: "submitted",
          title:
            body.requestType === "certified-copy"
              ? "Certified copy requested"
              : "Correction request submitted",
          actorId: me,
        },
      });

      return created;
    });
  }
}

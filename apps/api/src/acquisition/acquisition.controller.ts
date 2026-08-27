import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { IssueNoticeDto } from "./issue-notice.dto";
import { FileObjectionDto } from "./file-objection.dto";

const CLOSED_STATUSES = new Set(["approved", "rejected"]);

/**
 * Acquisition & requisition — the one service on this model the citizen
 * doesn't start. A land office officer issues a notice against a parcel for
 * a public purpose, naming a compensation award; the affected owner may
 * object in writing. There's no fee to collect — the flow runs the opposite
 * direction, an award rather than a charge — so this skips the generic
 * .../pay step every other service chains through: a notice is created
 * already `under-review`, straight to the officer's own decision queue.
 *
 * Deciding reuses ServiceApplicationsController's generic .../decision
 * unchanged: approve finalizes the notice at its stated award, reject
 * withdraws it. "Claim compensation" isn't modeled as a separate action —
 * an approved notice's awardAmount is the citizen's answer, the same way
 * every other service here stops short of modeling actual money movement.
 */
@Controller("acquisition")
export class AcquisitionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post("notice")
  @HttpCode(201)
  async issueNotice(@Body() body: IssueNoticeDto, @Req() req: Request) {
    const officerId = currentUserId(req);
    const [parcel, existing] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId } }),
      this.prisma.serviceApplication.findMany({
        where: { parcelId: body.parcelId, serviceType: "acquisition" },
      }),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (existing.some((a) => !CLOSED_STATUSES.has(a.status))) {
      throw new ConflictError("An acquisition notice is already open on this parcel.");
    }

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.serviceApplication.count({ where: { serviceType: "acquisition" } });
      const applicationNo = `ACQ-2026-${String(1000 + count).padStart(6, "0")}`;
      const now = new Date();

      const created = await tx.serviceApplication.create({
        data: {
          id: `sa-${randomUUID()}`,
          applicationNo,
          serviceType: "acquisition",
          status: "under-review",
          parcelId: parcel.id,
          applicantId: parcel.ownerId,
          assignedOfficerId: officerId,
          details: { purpose: body.purpose, awardAmount: body.awardAmount } as never,
          documentIds: [],
          submittedAt: now,
        },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: created.id,
        action: "create",
        actorId: officerId,
        payload: {
          applicationNo: created.applicationNo,
          serviceType: "acquisition",
          parcelDagNo: parcel.dagNo,
          awardAmount: body.awardAmount,
        },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: created.id,
          at: now,
          type: "submitted",
          title: "Acquisition notice issued",
          actorId: officerId,
        },
      });

      return created;
    });
  }

  /** Only the affected owner may object — same "same answer for missing or
   * not yours" shape as land-admin's apply(), so a stranger's notice can't
   * be confirmed to exist. */
  @Patch(":id/object")
  async fileObjection(
    @Param("id") id: string,
    @Body() body: FileObjectionDto,
    @Req() req: Request,
  ) {
    const me = currentUserId(req);
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application || application.applicantId !== me) {
      throw new NotFoundError("Service application not found");
    }
    if (CLOSED_STATUSES.has(application.status)) {
      throw new ConflictError("This notice has already been decided.");
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const details = {
        ...(application.details as Record<string, unknown>),
        objectionText: body.objectionText,
      };
      const updated = await tx.serviceApplication.update({
        where: { id },
        data: { details: details as never },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: updated.id,
        action: "status-change",
        actorId: me,
        payload: { applicationNo: updated.applicationNo },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: updated.id,
          at: now,
          type: "status-change",
          title: "Objection filed",
          actorId: me,
        },
      });

      return updated;
    });
  }
}

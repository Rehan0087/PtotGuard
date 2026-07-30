import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { filingReview, type FieldReport } from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";
import { UpdateFieldReportDto } from "./update-field-report.dto";

@Controller("field-reports")
export class FieldReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Declared before ":id" — Nest matches routes in registration order, and a
  // dynamic segment would otherwise swallow the literal path "assigned".
  @Get("assigned")
  assigned(@Req() req: Request) {
    return this.prisma.fieldReport.findMany({
      where: { assignedAgentId: currentUserId(req) },
      orderBy: { scheduledFor: "asc" },
    });
  }

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const agent = query.agent === "me" ? currentUserId(req) : query.agent;
    const where = {
      ...(agent ? { assignedAgentId: agent } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const all = await this.prisma.fieldReport.findMany({
      where,
      orderBy: { scheduledFor: "asc" },
    });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const report = await this.prisma.fieldReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundError("Field report not found");
    return { report, parcel: await findParcelView(this.prisma, report.parcelId) };
  }

  /**
   * Additive to the frozen spec: the agent's own edits to a report they are
   * carrying out — moving it along the status ladder, saving notes, and
   * filing it. `status: "completed"` is the filing, and it runs the same
   * gate the client shows (filingReview()) so a hand-rolled request can't
   * skip it.
   */
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateFieldReportDto,
    @Req() req: Request,
  ) {
    const report = await this.prisma.fieldReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundError("Field report not found");

    const notes = body.notes ?? report.notes ?? "";
    const actorId = currentUserId(req);

    if (body.status !== "completed") {
      return this.prisma.fieldReport.update({
        where: { id },
        data: {
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.status ? { status: body.status } : {}),
        },
      });
    }

    const review = filingReview(report as unknown as FieldReport, notes);
    if (!review.canFile) throw new ValidationError(review.blockers[0], "status");

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.fieldReport.update({
        where: { id },
        data: {
          status: "completed",
          submittedAt: now,
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      });

      await this.audit.append(tx, {
        entityType: "field-report",
        entityId: updated.id,
        action: "create",
        actorId,
        payload: {
          parcelDagNo: updated.parcelDagNo,
          purpose: updated.purpose,
          gpsCount: (updated.gpsCaptures as unknown[]).length,
          photoCount: (updated.photos as unknown[]).length,
        },
      });

      // The booking moved the case to "field-visit-scheduled"; filing is what
      // it was waiting on, so it goes back to an officer. Only when the visit
      // is what held it up — a case that moved on since is left alone.
      if (updated.disputeId) {
        const dispute = await tx.dispute.findUnique({ where: { id: updated.disputeId } });
        if (dispute && dispute.status === "field-visit-scheduled") {
          await tx.dispute.update({
            where: { id: dispute.id },
            data: { status: "under-review", updatedAt: now },
          });
          await tx.disputeEvent.create({
            data: {
              id: `de-${randomUUID()}`,
              disputeId: dispute.id,
              at: now,
              type: "field-visit",
              title: "Field survey filed",
              content: { code: "field-visit-completed" },
              // The agent's findings are record content — carried across as typed.
              description: notes,
              actorId,
            },
          });
        }
      }

      return updated;
    });
  }
}

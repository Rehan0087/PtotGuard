import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  filingReview,
  rankCandidates,
  type FieldReport,
  type Jurisdiction,
  type Parcel,
  type User,
} from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";
import { AddFieldReportMediaDto } from "./add-field-report-media.dto";
import { BookFieldSurveyDto } from "./book-field-survey.dto";
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

  /**
   * The land office booking a survey — additive to the frozen spec, and
   * this controller's first write beyond an agent's own report (it had no
   * create endpoint at all before this; `/agents` posted here against
   * nothing).
   *
   * `rankCandidates()` is the same ranker the officer's screen uses to grey
   * out an agent — run here against just the one chosen agent, so a
   * hand-rolled request can't book someone inactive, or outside their area
   * without the same explicit override the UI's own checkbox represents.
   */
  @Post()
  @HttpCode(201)
  async create(@Body() body: BookFieldSurveyDto, @Req() req: Request) {
    const actorId = currentUserId(req);

    const [parcel, agent, agentReports, jurisdictions, dispute] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId } }),
      this.prisma.user.findUnique({ where: { id: body.assignedAgentId } }),
      this.prisma.fieldReport.findMany({ where: { assignedAgentId: body.assignedAgentId } }),
      this.prisma.jurisdiction.findMany(),
      body.disputeId
        ? this.prisma.dispute.findUnique({ where: { id: body.disputeId } })
        : Promise.resolve(null),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (!agent || agent.role !== "field-agent") throw new NotFoundError("Field agent not found");
    if (body.disputeId && !dispute) throw new NotFoundError("Dispute not found");

    const [candidate] = rankCandidates(
      parcel as unknown as Parcel,
      [agent as unknown as User],
      agentReports as unknown as FieldReport[],
      jurisdictions as unknown as Jurisdiction[],
      body.allowOutsideJurisdiction ?? false,
    );
    if (candidate.blocker) throw new ValidationError(candidate.blocker, "assignedAgentId");

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const created = await tx.fieldReport.create({
        data: {
          id: `fr-${randomUUID()}`,
          parcelId: parcel.id,
          parcelDagNo: parcel.dagNo,
          disputeId: body.disputeId,
          purpose: body.purpose,
          status: "assigned",
          assignedAgentId: agent.id,
          scheduledFor: new Date(body.scheduledFor),
          addressHint: body.addressHint,
          gpsCaptures: [],
          photos: [],
        },
      });

      await this.audit.append(tx, {
        entityType: "field-report",
        entityId: created.id,
        action: "assign",
        actorId,
        payload: {
          parcelDagNo: created.parcelDagNo,
          purpose: created.purpose,
          assignedAgentId: agent.id,
        },
      });

      // Booking a survey against an open dispute moves the case along and
      // shows up on its tracking timeline, same as the real workflow.
      if (dispute) {
        await tx.dispute.update({
          where: { id: dispute.id },
          data: { assignedAgentId: agent.id, status: "field-visit-scheduled", updatedAt: now },
        });
        await tx.disputeEvent.create({
          data: {
            id: `de-${randomUUID()}`,
            disputeId: dispute.id,
            at: now,
            type: "field-visit",
            title: "Field visit scheduled",
            content: { code: "field-visit-scheduled" },
            description: `${agent.name} is booked for a ${body.purpose.replace(/-/g, " ")} on ${created.parcelDagNo}.`,
            actorId,
          },
        });

        // survey-scheduled has existed on NotificationContent since the
        // notifications system was built, with no writer anywhere — the
        // citizen whose case this is finds out their land is being surveyed
        // from the app, not by checking back on the case themselves.
        if (dispute.filedById !== actorId) {
          await tx.appNotification.create({
            data: {
              id: `n-${randomUUID()}`,
              userId: dispute.filedById,
              at: now,
              severity: "info",
              title: "Field survey scheduled",
              body: `A ${body.purpose.replace(/-/g, " ")} for dag ${created.parcelDagNo} has been scheduled.`,
              content: { code: "survey-scheduled", dagNo: created.parcelDagNo },
              read: false,
              href: `/disputes/${dispute.id}`,
            },
          });
        }
      }

      return created;
    });
  }

  /**
   * The agent's own evidence capture — additive to the frozen spec, and the
   * other half of what made a booking a dead end before this: nothing could
   * satisfy `filingReview()`'s gps/photo requirements without it.
   * `gpsCaptures`/`photos` are Json arrays appended to as a unit, same
   * pattern as `HearingsController.recordSession()`'s `sessions`.
   */
  @Post(":id/media")
  @HttpCode(201)
  async addMedia(@Param("id") id: string, @Body() body: AddFieldReportMediaDto) {
    const report = await this.prisma.fieldReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundError("Field report not found");

    const now = new Date().toISOString();
    const photos = report.photos as unknown as FieldReport["photos"];
    const gpsCaptures = report.gpsCaptures as unknown as FieldReport["gpsCaptures"];

    return this.prisma.fieldReport.update({
      where: { id },
      data: {
        ...(body.photo
          ? {
              photos: [
                ...photos,
                { id: `ph-${randomUUID()}`, ...body.photo, capturedAt: now },
              ] as never,
            }
          : {}),
        ...(body.gps
          ? {
              gpsCaptures: [
                ...gpsCaptures,
                {
                  id: `g-${randomUUID()}`,
                  point: { lat: body.gps.lat, lng: body.gps.lng },
                  accuracyMeters: body.gps.accuracyMeters,
                  label: body.gps.label,
                  capturedAt: now,
                },
              ] as never,
            }
          : {}),
      },
    });
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

import { randomUUID } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  filingReview,
  rankCandidates,
  reviewFieldReportTransition,
  reviewFieldSurveyTransition,
  type FieldReport,
  type Jurisdiction,
  type Parcel,
  type User,
} from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { findParcelView } from "../parcels/parcel-view";
import { AddFieldReportMediaDto } from "./add-field-report-media.dto";
import { BookFieldSurveyDto } from "./book-field-survey.dto";
import { CompleteFieldSurveyDto } from "./complete-field-survey.dto";
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
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  assigned(@Req() req: Request) {
    return this.prisma.fieldReport.findMany({
      where: { assignedAgentId: currentUserId(req) },
      orderBy: { scheduledFor: "asc" },
    });
  }

  @Get()
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
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
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
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
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  async addMedia(
    @Param("id") id: string,
    @Body() body: AddFieldReportMediaDto,
    @Req() req: Request,
  ) {
    const report = await this.prisma.fieldReport.findFirst({
      where: { id, assignedAgentId: currentUserId(req) },
    });
    if (!report) throw new NotFoundError("Field report not found");
    const activeSurvey = await this.prisma.fieldSurveySession.findFirst({
      where: {
        fieldReportId: id,
        assignedAgentId: currentUserId(req),
        status: "in-progress",
      },
    });
    if (!activeSurvey) {
      throw new ConflictError("Start field verification before adding evidence");
    }

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
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  async detail(@Param("id") id: string, @Req() req: Request) {
    const report = await this.prisma.fieldReport.findFirst({
      where: { id, assignedAgentId: currentUserId(req) },
    });
    if (!report) throw new NotFoundError("Field report not found");
    const [parcel, survey] = await Promise.all([
      findParcelView(this.prisma, report.parcelId),
      this.prisma.fieldSurveySession.findUnique({ where: { fieldReportId: id } }),
    ]);
    return { report, parcel, survey };
  }

  @Post(":id/accept")
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  async accept(@Param("id") id: string, @Req() req: Request) {
    const actorId = currentUserId(req);
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.fieldReport.updateMany({
        where: { id, assignedAgentId: actorId, status: "assigned" },
        data: { status: "accepted", acceptedAt: now },
      });
      if (claimed.count !== 1) {
        const existing = await tx.fieldReport.findUnique({ where: { id } });
        if (!existing || existing.assignedAgentId !== actorId) {
          throw new NotFoundError("Field report not found");
        }
        throw new ConflictError("This case has already been accepted or changed");
      }

      const updated = await tx.fieldReport.findUnique({ where: { id } });
      if (!updated) throw new NotFoundError("Field report not found");
      await this.audit.append(tx, {
        entityType: "field-report",
        entityId: id,
        action: "status-change",
        actorId,
        payload: {
          caseId: id,
          agentId: actorId,
          acceptedAt: now.toISOString(),
          previousStatus: "assigned",
          newStatus: "accepted",
        },
      });
      return updated;
    });
  }

  @Post(":id/survey/start")
  @HttpCode(201)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  async startSurvey(@Param("id") id: string, @Req() req: Request) {
    const actorId = currentUserId(req);
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.fieldReport.findFirst({
        where: { id, assignedAgentId: actorId },
      });
      if (!report) throw new NotFoundError("Field report not found");

      const existing = await tx.fieldSurveySession.findUnique({
        where: { fieldReportId: id },
      });
      if (existing) throw new ConflictError("A field survey already exists for this case");

      if (!(["accepted", "en-route"] as string[]).includes(report.status)) {
        throw new ConflictError("This case cannot start field verification in its current state");
      }
      const transition = reviewFieldSurveyTransition("not-started", "in-progress");
      if (!transition.allowed) {
        throw new ConflictError("This field survey cannot be started");
      }

      const claimed = await tx.fieldReport.updateMany({
        where: { id, assignedAgentId: actorId, status: report.status },
        data: { status: "in-progress" },
      });
      if (claimed.count !== 1) {
        throw new ConflictError("This case changed; reload and try again");
      }

      const parcel = await tx.parcel.findUnique({ where: { id: report.parcelId } });
      const now = new Date();
      const survey = await tx.fieldSurveySession.create({
        data: {
          id: `fs-${randomUUID()}`,
          fieldReportId: id,
          bhumiId: parcel?.ulpin,
          assignedAgentId: actorId,
          status: "in-progress",
          startedAt: now,
        },
      });
      const updatedReport = await tx.fieldReport.findUnique({ where: { id } });
      if (!updatedReport) throw new NotFoundError("Field report not found");

      await this.audit.append(tx, {
        entityType: "field-survey",
        entityId: survey.id,
        action: "start",
        actorId,
        payload: {
          fieldReportId: id,
          bhumiId: survey.bhumiId,
          startedAt: now.toISOString(),
        },
      });
      return { report: updatedReport, survey };
    });
  }

  @Post(":id/survey/complete")
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  async completeSurvey(
    @Param("id") id: string,
    @Body() body: CompleteFieldSurveyDto,
    @Req() req: Request,
  ) {
    const actorId = currentUserId(req);
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.fieldReport.findFirst({
        where: { id, assignedAgentId: actorId },
      });
      if (!report) throw new NotFoundError("Field report not found");
      if (report.status !== "in-progress") {
        throw new ConflictError("This case has no active field survey to complete");
      }

      const survey = await tx.fieldSurveySession.findFirst({
        where: { fieldReportId: id, assignedAgentId: actorId },
      });
      if (!survey || survey.status !== "in-progress") {
        throw new ConflictError("This case has no active field survey to complete");
      }

      const transition = reviewFieldSurveyTransition("in-progress", "completed");
      if (!transition.allowed) {
        throw new ConflictError("This field survey cannot be completed in its current state");
      }

      const review = filingReview(report as unknown as FieldReport, body.notes);
      if (!review.canFile) throw new ValidationError(review.blockers[0], "status");

      const now = new Date();
      const reportChanged = await tx.fieldReport.updateMany({
        where: { id, assignedAgentId: actorId, status: "in-progress" },
        data: { status: "completed", submittedAt: now, notes: body.notes },
      });
      if (reportChanged.count !== 1) {
        throw new ConflictError("This case changed; reload and try again");
      }

      const surveyChanged = await tx.fieldSurveySession.updateMany({
        where: { id: survey.id, assignedAgentId: actorId, status: "in-progress" },
        data: { status: "completed", completedAt: now },
      });
      if (surveyChanged.count !== 1) {
        throw new ConflictError("This field survey changed; reload and try again");
      }

      const updatedReport = await tx.fieldReport.findUnique({ where: { id } });
      const updatedSurvey = await tx.fieldSurveySession.findUnique({
        where: { fieldReportId: id },
      });
      if (!updatedReport || !updatedSurvey) {
        throw new NotFoundError("Field survey not found");
      }

      if (updatedReport.disputeId) {
        const dispute = await tx.dispute.findUnique({
          where: { id: updatedReport.disputeId },
        });
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
              description: body.notes,
              actorId,
            },
          });

          if (dispute.filedById !== actorId) {
            await tx.appNotification.create({
              data: {
                id: `n-${randomUUID()}`,
                userId: dispute.filedById,
                at: now,
                severity: "info",
                title: "Dispute status updated",
                body: `Case ${dispute.caseNumber} status was updated to under-review.`,
                content: { code: "dispute-status", caseNumber: dispute.caseNumber, status: "under-review" },
                read: false,
                href: `/disputes/${dispute.id}`,
              },
            });
          }
        }
      }

      await this.audit.append(tx, {
        entityType: "field-survey",
        entityId: updatedSurvey.id,
        action: "complete",
        actorId,
        payload: {
          fieldReportId: updatedReport.id,
          completedAt: now.toISOString(),
          gpsCount: (updatedReport.gpsCaptures as unknown[]).length,
          photoCount: (updatedReport.photos as unknown[]).length,
        },
      });

      return { report: updatedReport, survey: updatedSurvey };
    });
  }

  /**
   * Notes and the optional travel marker. Session start and completion use
   * dedicated transactional actions and cannot be reached from this patch.
   */
  @Patch(":id")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateFieldReportDto,
    @Req() req: Request,
  ) {
    const actorId = currentUserId(req);
    const report = await this.prisma.fieldReport.findFirst({
      where: { id, assignedAgentId: actorId },
    });
    if (!report) throw new NotFoundError("Field report not found");

    if (body.status) {
      const transition = reviewFieldReportTransition(
        report.status as FieldReport["status"],
        body.status,
      );
      if (!transition.allowed) throw new ValidationError(transition, "status");
    }

    if (!body.status) {
      return this.prisma.fieldReport.update({
        where: { id },
        data: { ...(body.notes !== undefined ? { notes: body.notes } : {}) },
      });
    }
    const changed = await this.prisma.fieldReport.updateMany({
      where: { id, assignedAgentId: actorId, status: report.status },
      data: {
        status: body.status,
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    if (changed.count !== 1) throw new ConflictError("This case changed; reload and try again");
    return this.prisma.fieldReport.findUnique({ where: { id } });
  }
}

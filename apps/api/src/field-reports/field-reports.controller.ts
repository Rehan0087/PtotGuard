import { createHash, randomUUID } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  Headers,
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
  analyzeGpsTrack,
  annotateGpsPoints,
  gpsPointErrors,
  rankCandidates,
  reviewFieldReportTransition,
  reviewFieldSurveyTransition,
  type FieldReport,
  type Jurisdiction,
  type Parcel,
  type User,
  type FieldSurveyGpsPoint,
  type GpsPointInput,
} from "@plotguard/rules";
import type { Prisma } from "@prisma/client";
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
import { AppendSurveyPointsDto } from "./append-survey-points.dto";
import { StartFieldSurveyDto } from "./start-field-survey.dto";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const payloadHash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");

const jsonValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function pointFromRow(row: Record<string, unknown>): FieldSurveyGpsPoint {
  return {
    id: row.id as string,
    fieldSurveySessionId: row.fieldSurveySessionId as string,
    sequence: row.sequence as number,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    recordedAt: new Date(row.recordedAt as string | Date).toISOString(),
    receivedAt: new Date(row.receivedAt as string | Date).toISOString(),
    accuracyMeters: row.accuracyMeters as number,
    ...(row.altitudeMeters === null || row.altitudeMeters === undefined
      ? {}
      : { altitudeMeters: row.altitudeMeters as number }),
    ...(row.speedMetersPerSecond === null || row.speedMetersPerSecond === undefined
      ? {}
      : { speedMetersPerSecond: row.speedMetersPerSecond as number }),
    ...(row.headingDegrees === null || row.headingDegrees === undefined
      ? {}
      : { headingDegrees: row.headingDegrees as number }),
    issues: row.issues as FieldSurveyGpsPoint["issues"],
  };
}

@Controller("field-reports")
export class FieldReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async idempotent<T>(
    tx: Prisma.TransactionClient,
    key: string | undefined,
    identity: { actorId: string; fieldReportId: string; operationType: string },
    payload: unknown,
    statusCode: number,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!key) return run();
    const hash = payloadHash(payload);
    const existing = await tx.fieldSurveySyncReceipt.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      if (
        existing.assignedAgentId !== identity.actorId ||
        existing.fieldReportId !== identity.fieldReportId ||
        existing.operationType !== identity.operationType ||
        existing.payloadHash !== hash
      ) {
        throw new ConflictError("This idempotency key was already used for different data", {
          code: "idempotency-key-reused",
        });
      }
      return existing.responseBody as T;
    }

    const result = await run();
    await tx.fieldSurveySyncReceipt.create({
      data: {
        idempotencyKey: key,
        assignedAgentId: identity.actorId,
        fieldReportId: identity.fieldReportId,
        operationType: identity.operationType,
        payloadHash: hash,
        statusCode,
        responseBody: jsonValue(result) as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  private surveyResponse(survey: Record<string, unknown>, points: FieldSurveyGpsPoint[]) {
    return {
      ...survey,
      startedAt: new Date(survey.startedAt as string | Date).toISOString(),
      ...(survey.completedAt
        ? { completedAt: new Date(survey.completedAt as string | Date).toISOString() }
        : {}),
      points,
      ...(survey.summary ? { summary: survey.summary } : {}),
    };
  }

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

    const [parcel, agent, agentReports, jurisdictions, dispute, mutation] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId } }),
      this.prisma.user.findUnique({ where: { id: body.assignedAgentId } }),
      this.prisma.fieldReport.findMany({ where: { assignedAgentId: body.assignedAgentId } }),
      this.prisma.jurisdiction.findMany(),
      body.disputeId
        ? this.prisma.dispute.findUnique({ where: { id: body.disputeId } })
        : Promise.resolve(null),
      body.mutationId
        ? this.prisma.mutation.findUnique({ where: { id: body.mutationId } })
        : Promise.resolve(null),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (!agent || agent.role !== "field-agent") throw new NotFoundError("Field agent not found");
    if (body.disputeId && !dispute) throw new NotFoundError("Dispute not found");
    if (body.mutationId && !mutation) throw new NotFoundError("Mutation not found");
    if (mutation && mutation.parcelId !== parcel.id) {
      throw new ValidationError({ code: "mutation-parcel-mismatch" }, "mutationId");
    }
    if (mutation && mutation.status !== "under-primary-verification") {
      throw new ValidationError({ code: "wrong-status", expected: ["under-primary-verification"] }, "mutationId");
    }

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
      if (mutation) {
        const existing = await tx.fieldReport.findFirst({
          where: { mutationId: mutation.id, status: { not: "cancelled" } },
          select: { id: true },
        });
        if (existing) throw new ConflictError("This mutation already has a field visit.");
      }
      const created = await tx.fieldReport.create({
        data: {
          id: `fr-${randomUUID()}`,
          parcelId: parcel.id,
          parcelDagNo: parcel.dagNo,
          disputeId: body.disputeId,
          mutationId: body.mutationId,
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

      if (mutation) {
        await this.audit.append(tx, {
          entityType: "mutation",
          entityId: mutation.id,
          action: "assign-field-agent",
          actorId,
          payload: {
            previousStatus: mutation.status,
            newStatus: mutation.status,
            fieldReportId: created.id,
            assignedAgentId: agent.id,
          },
        });
      }

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
        ...(body.sketchMap
          ? {
              sketchMapUrl: body.sketchMap.url,
              sketchMapFileName: body.sketchMap.fileName,
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
    const points = survey
      ? await this.prisma.fieldSurveyGpsPoint.findMany({
          where: { fieldSurveySessionId: survey.id },
          orderBy: { sequence: "asc" },
        })
      : [];
    return {
      report,
      parcel,
      survey: survey
        ? this.surveyResponse(survey as unknown as Record<string, unknown>, points.map((row) => pointFromRow(row as unknown as Record<string, unknown>)))
        : null,
    };
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
  async startSurvey(
    @Param("id") id: string,
    @Body() body: StartFieldSurveyDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const actorId = currentUserId(req);
    const start = body ?? {};
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.fieldReport.findFirst({
        where: { id, assignedAgentId: actorId },
      });
      if (!report) throw new NotFoundError("Field report not found");

      return this.idempotent(
        tx,
        idempotencyKey,
        { actorId, fieldReportId: id, operationType: "START_SURVEY" },
        start,
        201,
        async () => {

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
          id: start.localSessionId ?? `fs-${randomUUID()}`,
          localSessionId: start.localSessionId,
          fieldReportId: id,
          bhumiId: parcel?.ulpin,
          assignedAgentId: actorId,
          status: "in-progress",
          version: 1,
          startedAt: now,
          summary: undefined,
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
      return {
        report: updatedReport,
        survey: this.surveyResponse(survey as unknown as Record<string, unknown>, []),
      };
        },
      );
    });
  }

  @Post(":id/survey/points")
  @HttpCode(201)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  async appendSurveyPoints(
    @Param("id") id: string,
    @Body() body: AppendSurveyPointsDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const actorId = currentUserId(req);
    const owned = await this.prisma.fieldReport.findFirst({
      where: { id, assignedAgentId: actorId },
    });
    if (!owned) throw new NotFoundError("Field report not found");

    return this.prisma.$transaction(async (tx) =>
      this.idempotent(
        tx,
        idempotencyKey,
        { actorId, fieldReportId: id, operationType: "APPEND_POINTS" },
        body,
        201,
        async () => {
          const survey = await tx.fieldSurveySession.findFirst({
            where: { fieldReportId: id, assignedAgentId: actorId, status: "in-progress" },
          });
          if (!survey) throw new ConflictError("This case has no active field survey");

          for (const input of body.points as GpsPointInput[]) {
            const errors = gpsPointErrors(input);
            if (errors.length) {
              throw new ValidationError({ code: "invalid-gps-point", fields: errors }, "points");
            }
          }

          const storedRows = await tx.fieldSurveyGpsPoint.findMany({
            where: { fieldSurveySessionId: survey.id },
            orderBy: { sequence: "asc" },
          });
          const stored = storedRows.map((row) =>
            pointFromRow(row as unknown as Record<string, unknown>),
          );
          const newInputs: GpsPointInput[] = [];
          let nextSequence = (stored.at(-1)?.sequence ?? 0) + 1;

          for (const input of body.points as GpsPointInput[]) {
            const byId = stored.find((point) => point.id === input.id);
            const bySequence = stored.find((point) => point.sequence === input.sequence);
            if (byId || bySequence) {
              const existing = byId ?? bySequence!;
              const comparable = {
                id: existing.id,
                sequence: existing.sequence,
                latitude: existing.latitude,
                longitude: existing.longitude,
                recordedAt: existing.recordedAt,
                accuracyMeters: existing.accuracyMeters,
                ...(existing.altitudeMeters === undefined ? {} : { altitudeMeters: existing.altitudeMeters }),
                ...(existing.speedMetersPerSecond === undefined ? {} : { speedMetersPerSecond: existing.speedMetersPerSecond }),
                ...(existing.headingDegrees === undefined ? {} : { headingDegrees: existing.headingDegrees }),
              };
              if (!byId || !bySequence || canonical(comparable) !== canonical(input)) {
                throw new ConflictError("GPS point identity or sequence conflicts with server data", {
                  code: "gps-point-conflict",
                  serverData: existing,
                  localData: input,
                });
              }
              continue;
            }
            if (input.sequence !== nextSequence) {
              throw new ConflictError("GPS point sequence is not contiguous", {
                code: "gps-sequence-gap",
                expectedSequence: nextSequence,
                localData: input,
              });
            }
            newInputs.push(input);
            nextSequence += 1;
          }

          const previous = stored.at(-1);
          const annotated = annotateGpsPoints(
            [...(previous ? [previous] : []), ...newInputs],
            survey.id,
          ).slice(previous ? 1 : 0);
          for (const point of annotated) {
            await tx.fieldSurveyGpsPoint.create({
              data: {
                id: point.id,
                fieldSurveySessionId: point.fieldSurveySessionId,
                sequence: point.sequence,
                latitude: point.latitude,
                longitude: point.longitude,
                recordedAt: new Date(point.recordedAt),
                receivedAt: new Date(point.receivedAt),
                accuracyMeters: point.accuracyMeters,
                altitudeMeters: point.altitudeMeters ?? null,
                speedMetersPerSecond: point.speedMetersPerSecond ?? null,
                headingDegrees: point.headingDegrees ?? null,
                issues: point.issues,
              },
            });
          }

          const version = survey.version + (annotated.length ? 1 : 0);
          if (annotated.length) {
            await tx.fieldSurveySession.update({ where: { id: survey.id }, data: { version } });
          }
          const accepted = [...stored, ...annotated];
          return {
            points: accepted.filter((point) =>
              body.points.some((input) => input.id === point.id),
            ),
            acceptedThroughSequence: accepted.at(-1)?.sequence ?? 0,
            sessionId: survey.id,
            version,
          };
        },
      ),
    );
  }

  @Post(":id/survey/complete")
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  async completeSurvey(
    @Param("id") id: string,
    @Body() body: CompleteFieldSurveyDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    const actorId = currentUserId(req);
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.fieldReport.findFirst({
        where: { id, assignedAgentId: actorId },
      });
      if (!report) throw new NotFoundError("Field report not found");
      return this.idempotent(
        tx,
        idempotencyKey,
        { actorId, fieldReportId: id, operationType: "COMPLETE_SURVEY" },
        body,
        200,
        async () => {
      if (report.status !== "in-progress") {
        throw new ConflictError("This case has no active field survey to complete");
      }

      const survey = await tx.fieldSurveySession.findFirst({
        where: { fieldReportId: id, assignedAgentId: actorId },
      });
      if (!survey || survey.status !== "in-progress") {
        throw new ConflictError("This case has no active field survey to complete");
      }
      if (body.expectedVersion !== undefined && body.expectedVersion !== survey.version) {
        throw new ConflictError("The field survey changed on the server", {
          code: "survey-version-conflict",
          localData: body,
          serverData: survey,
        });
      }

      const transition = reviewFieldSurveyTransition("in-progress", "completed");
      if (!transition.allowed) {
        throw new ConflictError("This field survey cannot be completed in its current state");
      }

      const pointRows = await tx.fieldSurveyGpsPoint.findMany({
        where: { fieldSurveySessionId: survey.id },
        orderBy: { sequence: "asc" },
      });
      const points = pointRows.map((row) => pointFromRow(row as unknown as Record<string, unknown>));
      const gpsCount = points.length || (report.gpsCaptures as unknown[]).length;
      const review = filingReview(report as unknown as FieldReport, body.notes, { gpsCount });
      if (!review.canFile) throw new ValidationError(review.blockers[0], "status");

      const now = new Date();
      const summary = analyzeGpsTrack(points, survey.startedAt.toISOString(), now.toISOString());
      const reportChanged = await tx.fieldReport.updateMany({
        where: { id, assignedAgentId: actorId, status: "in-progress" },
        data: { status: "completed", submittedAt: now, notes: body.notes },
      });
      if (reportChanged.count !== 1) {
        throw new ConflictError("This case changed; reload and try again");
      }

      const surveyChanged = await tx.fieldSurveySession.updateMany({
        where: {
          id: survey.id,
          assignedAgentId: actorId,
          status: "in-progress",
          version: survey.version,
        },
        data: {
          status: "completed",
          completedAt: now,
          summary: jsonValue(summary) as unknown as Prisma.InputJsonValue,
          version: survey.version + 1,
        },
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

      if (updatedReport.mutationId) {
        const parentMutation = await tx.mutation.findUnique({
          where: { id: updatedReport.mutationId },
        });
        if (parentMutation && parentMutation.status === "field-investigation") {
          await tx.mutation.update({
            where: { id: parentMutation.id },
            data: { status: "field-verification-complete" },
          });
          await this.audit.append(tx, {
            entityType: "mutation",
            entityId: parentMutation.id,
            action: "field-verification-complete",
            actorId,
            payload: {
              previousStatus: parentMutation.status,
              newStatus: "field-verification-complete",
              fieldReportId: updatedReport.id,
              note: body.notes,
            },
          });

          if (body.disputeFound && !parentMutation.disputeId) {
            const [count, mediator, agent] = await Promise.all([
              tx.dispute.count(),
              tx.user.findFirst({ where: { role: "mediator", status: "active" } }),
              tx.user.findUnique({ where: { id: actorId } }),
            ]);
            const dispute = await tx.dispute.create({
              data: {
                id: `ds-${randomUUID()}`,
                caseNumber: `DSP-${now.getUTCFullYear()}-${String(500 + count).padStart(5, "0")}`,
                parcelId: parentMutation.parcelId,
                parcelDagNo: parentMutation.parcelDagNo,
                type: "boundary",
                status: "in-mediation",
                priority: "high",
                filedById: actorId,
                filedByName: agent?.name ?? "Field agent",
                filedAt: now,
                description: body.disputeDescription?.trim() || body.notes,
                parties: [{ name: parentMutation.fromOwnerName, role: "claimant" }, { name: parentMutation.toOwnerName, role: "respondent" }],
                assignedAgentId: actorId,
                assignedMediatorId: mediator?.id,
                evidenceDocumentIds: parentMutation.documentIds,
              },
            });
            await tx.mutation.update({
              where: { id: parentMutation.id },
              data: { disputeId: dispute.id },
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
          gpsCount,
          pathLengthMeters: summary.pathLengthMeters,
          areaSquareMeters: summary.areaSquareMeters,
          confidence: summary.confidence,
          geometry: summary.geometry,
          issueCounts: summary.issueCounts,
          photoCount: (updatedReport.photos as unknown[]).length,
        },
      });

      return {
        report: updatedReport,
        survey: this.surveyResponse(
          updatedSurvey as unknown as Record<string, unknown>,
          points,
        ),
      };
        },
      );
    });
  }

  /**
   * Notes and the optional travel marker. Session start and completion use
   * dedicated transactional actions and cannot be reached from this patch.
   */
  @Patch(":id/flag-dispute")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  async flagDispute(
    @Param("id") id: string,
    @Body() body: { description?: string },
    @Req() req: Request,
  ) {
    const actorId = currentUserId(req);
    const description = body.description?.trim();
    if (!description) throw new ValidationError({ code: "dispute-description-required" }, "description");
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.fieldReport.findFirst({ where: { id, assignedAgentId: actorId } });
      if (!report || !report.mutationId) throw new NotFoundError("Mutation field report not found");
      const mutation = await tx.mutation.findUnique({ where: { id: report.mutationId } });
      if (!mutation) throw new NotFoundError("Mutation not found");
      if (mutation.disputeId) return report;
      const [count, mediator, agent] = await Promise.all([
        tx.dispute.count(),
        tx.user.findFirst({ where: { role: "mediator", status: "active" } }),
        tx.user.findUnique({ where: { id: actorId } }),
      ]);
      const now = new Date();
      const dispute = await tx.dispute.create({
        data: {
          id: `ds-${randomUUID()}`,
          caseNumber: `DSP-${now.getUTCFullYear()}-${String(500 + count).padStart(5, "0")}`,
          parcelId: mutation.parcelId,
          parcelDagNo: mutation.parcelDagNo,
          type: "boundary", status: "in-mediation", priority: "high",
          filedById: actorId, filedByName: agent?.name ?? "Field agent", filedAt: now,
          description,
          parties: [{ name: mutation.fromOwnerName, role: "claimant" }, { name: mutation.toOwnerName, role: "respondent" }],
          assignedAgentId: actorId, assignedMediatorId: mediator?.id,
          evidenceDocumentIds: mutation.documentIds,
        },
      });
      await tx.mutation.update({ where: { id: mutation.id }, data: { disputeId: dispute.id } });
      await this.audit.append(tx, {
        entityType: "mutation", entityId: mutation.id, action: "dispute-filed", actorId,
        payload: { caseNumber: dispute.caseNumber, previousStatus: mutation.status, newStatus: mutation.status, note: description },
      });
      return report;
    });
  }

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

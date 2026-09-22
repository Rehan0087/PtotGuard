import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import {
  acquisitionTransition,
  validIncreasedAward,
  type AcquisitionDetails,
} from "@plotguard/rules";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { currentUserId } from "../auth/dev-current-user";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { IssueNoticeDto } from "./issue-notice.dto";
import { SubmitFieldReviewDto } from "./submit-field-review.dto";
import { FileAcquisitionAppealDto } from "./file-acquisition-appeal.dto";
import { DecideAcquisitionAppealDto } from "./decide-acquisition-appeal.dto";

const CLOSED_STATUSES = new Set(["approved", "rejected", "withdrawn"]);
const STATE_OWNER_ID = "usr-state";
const STATE_OWNER_NAME = "Government of Bangladesh";

@Controller("acquisition")
export class AcquisitionController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private assertTransition(
    details: AcquisitionDetails,
    status: Parameters<typeof acquisitionTransition>[1],
    action: Parameters<typeof acquisitionTransition>[2],
  ) {
    const review = acquisitionTransition(details, status, action);
    if (!review.allowed) throw new ValidationError(review.blockers[0], "status");
  }

  private async event(
    tx: Prisma.TransactionClient,
    applicationId: string,
    actorId: string,
    type: string,
    title: string,
    description?: string,
  ) {
    await tx.serviceApplicationEvent.create({
      data: { id: `sae-${randomUUID()}`, applicationId, at: new Date(), type, title, description, actorId },
    });
  }

  private async notify(
    tx: Prisma.TransactionClient,
    userId: string,
    title: string,
    body: string,
    severity: "info" | "success" | "warning" | "critical" = "info",
  ) {
    await tx.appNotification.create({
      data: { id: `ntf-${randomUUID()}`, userId, at: new Date(), severity, title, body, read: false, href: "/acquisition" },
    });
  }

  private async complete(
    tx: Prisma.TransactionClient,
    application: { id: string; applicationNo: string; parcelId: string | null; applicantId: string; details: unknown },
    actorId: string,
    details: AcquisitionDetails,
    title: string,
  ) {
    if (!application.parcelId) throw new ConflictError("Acquisition has no parcel.");
    const parcel = await tx.parcel.findUnique({ where: { id: application.parcelId } });
    if (!parcel) throw new NotFoundError("Parcel not found");
    const now = new Date();

    await tx.user.upsert({
      where: { id: STATE_OWNER_ID },
      update: {},
      create: {
        id: STATE_OWNER_ID,
        name: STATE_OWNER_NAME,
        email: "state.owner@plotguard.gov.bd",
        role: "land-office",
        jurisdictionId: parcel.jurisdictionId,
        status: "suspended",
        title: "State-owned property account",
      },
    });
    await tx.ownershipRecord.updateMany({
      where: { parcelId: parcel.id, toDate: null },
      data: { toDate: now },
    });
    await tx.ownershipRecord.create({
      data: {
        id: `own-${randomUUID()}`,
        parcelId: parcel.id,
        ownerId: STATE_OWNER_ID,
        ownerName: STATE_OWNER_NAME,
        acquisitionType: "state-acquisition",
        fromDate: now,
      },
    });
    await tx.parcel.update({
      where: { id: parcel.id },
      data: { ownerId: STATE_OWNER_ID, ownershipType: "government", lastMutationAt: now },
    });
    await tx.parcelRestriction.updateMany({
      where: { parcelId: parcel.id, type: "acquisition", referenceNo: application.applicationNo, toDate: null },
      data: { toDate: now },
    });
    const completedDetails: AcquisitionDetails = { ...details, stage: "completed", completedAt: now.toISOString() };
    const updated = await tx.serviceApplication.update({
      where: { id: application.id },
      data: { status: "approved", details: completedDetails as never, decidedAt: now },
    });
    await this.event(tx, application.id, actorId, "accepted", title);
    await this.notify(
      tx,
      application.applicantId,
      "Land acquisition completed",
      `${application.applicationNo} is complete. Ownership is now recorded as state-owned property.`,
      "success",
    );
    return updated;
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  @Post("notice")
  @HttpCode(201)
  async issueNotice(@Body() body: IssueNoticeDto, @Req() req: Request) {
    const officerId = currentUserId(req);
    const [parcel, agent, existing] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId } }),
      this.prisma.user.findUnique({ where: { id: body.assignedFieldAgentId } }),
      this.prisma.serviceApplication.findMany({ where: { parcelId: body.parcelId, serviceType: "acquisition" } }),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (!agent || agent.role !== "field-agent" || agent.status !== "active") {
      throw new ValidationError({ code: "invalid-field-agent" }, "assignedFieldAgentId");
    }
    if (existing.some((application) => !CLOSED_STATUSES.has(application.status))) {
      throw new ConflictError("An acquisition request is already open on this parcel.");
    }

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.serviceApplication.count({ where: { serviceType: "acquisition" } });
      const applicationNo = `ACQ-2026-${String(1000 + count).padStart(6, "0")}`;
      const now = new Date();
      const details: AcquisitionDetails = {
        stage: "field-review",
        purpose: body.purpose,
        createdByOfficerId: officerId,
        assignedFieldAgentId: agent.id,
      };
      const created = await tx.serviceApplication.create({
        data: {
          id: `sa-${randomUUID()}`,
          applicationNo,
          serviceType: "acquisition",
          status: "field-investigation",
          parcelId: parcel.id,
          applicantId: parcel.ownerId,
          assignedOfficerId: agent.id,
          details: details as never,
          documentIds: [],
          submittedAt: now,
        },
      });
      await tx.parcelRestriction.create({
        data: {
          id: `res-${randomUUID()}`,
          parcelId: parcel.id,
          type: "acquisition",
          authority: "Land Office",
          referenceNo: applicationNo,
          note: body.purpose,
          fromDate: now,
        },
      });
      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: created.id,
        action: "create",
        actorId: officerId,
        payload: { applicationNo, serviceType: "acquisition", parcelDagNo: parcel.dagNo, assignedFieldAgentId: agent.id },
      });
      await this.event(tx, created.id, officerId, "assigned", "Acquisition review assigned", `Assigned to ${agent.name}.`);
      await this.notify(tx, agent.id, "Acquisition review assigned", `${applicationNo} requires your field review and compensation valuation.`);
      return created;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("field-agent")
  @Patch(":id/field-review")
  async submitFieldReview(@Param("id") id: string, @Body() body: SubmitFieldReviewDto, @Req() req: Request) {
    const agentId = currentUserId(req);
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application || application.serviceType !== "acquisition" || application.assignedOfficerId !== agentId) {
      throw new NotFoundError("Acquisition request not found");
    }
    const details = application.details as unknown as AcquisitionDetails;
    this.assertTransition(details, application.status as Parameters<typeof acquisitionTransition>[1], "field-review");

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const next: AcquisitionDetails = {
        ...details,
        stage: "citizen-decision",
        awardAmount: body.awardAmount,
        fieldReview: { reviewedAt: now.toISOString(), reviewedById: agentId, notes: body.reviewNotes },
      };
      const updated = await tx.serviceApplication.update({ where: { id }, data: { status: "under-review", details: next as never } });
      await this.audit.append(tx, {
        entityType: "service-application", entityId: id, action: "field-review", actorId: agentId,
        payload: { applicationNo: application.applicationNo, awardAmount: body.awardAmount },
      });
      await this.event(tx, id, agentId, "field-reviewed", "Field review and valuation completed");
      await this.notify(tx, application.applicantId, "Acquisition compensation offered", `${application.applicationNo} offers BDT ${body.awardAmount}. Accept it or file an appeal.`, "warning");
      return updated;
    });
  }

  @UseGuards(AccessTokenGuard)
  @Patch(":id/accept")
  async accept(@Param("id") id: string, @Req() req: Request) {
    const citizenId = currentUserId(req);
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application || application.serviceType !== "acquisition" || application.applicantId !== citizenId) {
      throw new NotFoundError("Acquisition request not found");
    }
    const details = application.details as unknown as AcquisitionDetails;
    this.assertTransition(details, application.status as Parameters<typeof acquisitionTransition>[1], "citizen-accept");
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.complete(tx, application, citizenId, details, "Citizen accepted the compensation offer");
      await this.audit.append(tx, {
        entityType: "service-application", entityId: id, action: "accept", actorId: citizenId,
        payload: { applicationNo: application.applicationNo, awardAmount: details.awardAmount },
      });
      return updated;
    });
  }

  @UseGuards(AccessTokenGuard)
  @Patch(":id/appeal")
  async appeal(@Param("id") id: string, @Body() body: FileAcquisitionAppealDto, @Req() req: Request) {
    const citizenId = currentUserId(req);
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application || application.serviceType !== "acquisition" || application.applicantId !== citizenId) {
      throw new NotFoundError("Acquisition request not found");
    }
    const details = application.details as unknown as AcquisitionDetails;
    this.assertTransition(details, application.status as Parameters<typeof acquisitionTransition>[1], "citizen-appeal");
    if (body.outcome === "increase-compensation" && !validIncreasedAward(details.awardAmount, body.requestedAmount)) {
      throw new ValidationError({ code: "appeal-amount-not-higher" }, "requestedAmount");
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const next: AcquisitionDetails = {
        ...details,
        stage: "appeal-review",
        appeal: { outcome: body.outcome, reason: body.reason, requestedAmount: body.requestedAmount, filedAt: now.toISOString() },
      };
      const updated = await tx.serviceApplication.update({ where: { id }, data: { status: "hearing-scheduled", details: next as never } });
      await this.audit.append(tx, {
        entityType: "service-application", entityId: id, action: "appeal", actorId: citizenId,
        payload: { applicationNo: application.applicationNo, outcome: body.outcome, requestedAmount: body.requestedAmount },
      });
      await this.event(tx, id, citizenId, "appealed", "Citizen appealed the acquisition", body.reason);
      await this.notify(tx, details.createdByOfficerId, "Acquisition appeal filed", `${application.applicationNo} requires a land-office decision.`, "warning");
      return updated;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  @Patch(":id/appeal-decision")
  async decideAppeal(@Param("id") id: string, @Body() body: DecideAcquisitionAppealDto, @Req() req: Request) {
    const officerId = currentUserId(req);
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application || application.serviceType !== "acquisition") throw new NotFoundError("Acquisition request not found");
    const details = application.details as unknown as AcquisitionDetails;
    this.assertTransition(details, application.status as Parameters<typeof acquisitionTransition>[1], `appeal-${body.decision}`);
    if (body.decision === "increase-compensation" && !validIncreasedAward(details.awardAmount, body.awardAmount)) {
      throw new ValidationError({ code: "decision-amount-not-higher" }, "awardAmount");
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const decision = { decision: body.decision, note: body.note, decidedAt: now.toISOString(), decidedById: officerId };
      if (body.decision === "proceed") {
        const updated = await this.complete(tx, application, officerId, { ...details, appealDecision: decision }, "Land office confirmed acquisition after appeal");
        await this.audit.append(tx, { entityType: "service-application", entityId: id, action: "appeal-proceed", actorId: officerId, payload: { applicationNo: application.applicationNo } });
        return updated;
      }
      if (body.decision === "withdraw") {
        const next: AcquisitionDetails = { ...details, stage: "withdrawn", appealDecision: decision };
        const updated = await tx.serviceApplication.update({ where: { id }, data: { status: "rejected", details: next as never, decidedAt: now } });
        if (application.parcelId) {
          await tx.parcelRestriction.updateMany({ where: { parcelId: application.parcelId, type: "acquisition", referenceNo: application.applicationNo, toDate: null }, data: { toDate: now } });
        }
        await this.event(tx, id, officerId, "decided", "Land office withdrew the acquisition", body.note);
        await this.notify(tx, application.applicantId, "Acquisition withdrawn", `${application.applicationNo} will not acquire your land.`, "success");
        await this.audit.append(tx, { entityType: "service-application", entityId: id, action: "appeal-withdraw", actorId: officerId, payload: { applicationNo: application.applicationNo } });
        return updated;
      }
      const next: AcquisitionDetails = {
        ...details,
        stage: "citizen-decision",
        awardAmount: body.awardAmount,
        appeal: undefined,
        appealDecision: decision,
      };
      const updated = await tx.serviceApplication.update({ where: { id }, data: { status: "under-review", details: next as never } });
      await this.event(tx, id, officerId, "decided", "Compensation offer increased", body.note);
      await this.notify(tx, application.applicantId, "Acquisition compensation increased", `${application.applicationNo} now offers BDT ${body.awardAmount}.`, "success");
      await this.audit.append(tx, { entityType: "service-application", entityId: id, action: "appeal-increase", actorId: officerId, payload: { applicationNo: application.applicationNo, awardAmount: body.awardAmount } });
      return updated;
    });
  }
}

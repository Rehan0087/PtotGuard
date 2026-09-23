import { randomUUID } from "node:crypto";
import {
  Body,
  Controller,
  ForbiddenException,
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
import type { Prisma } from "@prisma/client";
import {
  ACQUISITION_TYPE_BY_MUTATION_TYPE,
  listingAfterMutationDecision,
  mutationActionGate,
  mutationDocumentGate,
  mutationObjectionSummary,
  mutationVerificationReferences,
  verificationGate,
  transferReview,
  type Mutation,
  type MutationType,
  type MutationStatus,
  type ParcelRestriction,
} from "@plotguard/rules";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";
import { MutationDecisionDto } from "./mutation-decision.dto";
import { CreateMutationDto } from "./create-mutation.dto";
import { CompleteVerificationDto } from "./complete-verification.dto";
import {
  assertLandOfficeActor,
  assertMutationActionAccess,
  coveredJurisdictionIds,
  loadMutationActor,
  loadMutationReadActor,
  type MutationActor,
} from "./mutation-access";

function asMutationStatus(value: unknown): MutationStatus | undefined {
  return typeof value === "string" && ["submitted", "under-primary-verification", "field-investigation", "field-verification-complete", "approved", "rejected", "awaiting-dcr-payment", "complete"].includes(value)
    ? value as MutationStatus : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function updatedKhatianSequence(mutationNumber: string): string {
  return mutationNumber.replace(/\D/g, "").slice(-8).padStart(8, "0");
}

type ActionContext = Awaited<ReturnType<MutationsController["actionContext"]>>;

@Controller("mutations")
export class MutationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const actor = await loadMutationReadActor(this.prisma, req);
    const where = actor.role === "land-office"
      ? await this.landOfficeListWhere(query, actor)
      : {
          requestedById: actor.id,
          ...(query.status ? { status: query.status } : {}),
        };
    const all = await this.prisma.mutation.findMany({ where, orderBy: { requestedAt: "desc" } });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string, @Req() req: Request) {
    const actor = await loadMutationReadActor(this.prisma, req);
    const mutation = await this.prisma.mutation.findUnique({ where: { id } });
    if (!mutation) throw new NotFoundError("Mutation not found");

    const accessParcel = await this.prisma.parcel.findUnique({
      where: { id: mutation.parcelId },
      select: { jurisdictionId: true },
    });
    if (actor.role === "citizen") {
      if (mutation.requestedById !== actor.id) {
        throw new ForbiddenException("You can only view your own mutations.");
      }
    } else {
      const jurisdictions = await this.prisma.jurisdiction.findMany();
      if (accessParcel && !coveredJurisdictionIds(actor, jurisdictions).has(accessParcel.jurisdictionId)) {
        throw new ForbiddenException("This mutation is outside your jurisdiction.");
      }
    }

    const summary = (userId: string | null | undefined) => userId
      ? this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, title: true },
        })
      : null;
    const [parcel, documents, applicant, assignedOfficer, verificationStartedBy, verifiedBy, jurisdiction, events, fieldReport, dispute] = await Promise.all([
      findParcelView(this.prisma, mutation.parcelId),
      this.prisma.landDocument.findMany({ where: { id: { in: mutation.documentIds } } }),
      summary(mutation.requestedById),
      summary(mutation.assignedOfficerId),
      summary(mutation.verificationStartedById),
      summary(mutation.verifiedById),
      accessParcel
        ? this.prisma.jurisdiction.findUnique({
            where: { id: accessParcel.jurisdictionId },
            select: { id: true, code: true, name: true, nameBn: true },
          })
        : null,
      this.prisma.auditEvent.findMany({
        where: { entityType: "mutation", entityId: id },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.fieldReport.findFirst({ where: { mutationId: id }, orderBy: { assignedAt: "desc" } }),
      mutation.disputeId
        ? this.prisma.dispute.findUnique({ where: { id: mutation.disputeId } })
        : Promise.resolve(null),
    ]);
    return {
      mutation: { ...mutation, fieldReportId: fieldReport?.id }, parcel, documents, applicant, assignedOfficer, verificationStartedBy, verifiedBy,
      fieldReport, dispute,
      jurisdiction,
      objectionSummary: mutationObjectionSummary(mutation as unknown as Mutation),
      timeline: events.map((event) => {
        const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? event.payload : {};
        return {
          id: event.id,
          action: event.action,
          at: event.createdAt.toISOString(),
          actorName: event.actorName ?? "System",
          actorRole: asOptionalString(payload.actorRole),
          previousStatus: asMutationStatus(payload.previousStatus),
          newStatus: asMutationStatus(payload.newStatus),
          note: asOptionalString(payload.note ?? payload.reason),
        };
      }),
    };
  }

  /**
   * Citizen filing — additive to the frozen spec, which froze only the
   * decision endpoint. Gated by transferReview(), not approvalGate(): the
   * question at filing time is not "has the objection window closed" (there
   * is no window yet — that starts once an officer moves this past
   * verification), it is "can this land change hands at all". A plot under
   * an active injunction, attachment, or acquisition notice has no business
   * entering the pipeline; a mortgaged one may, the same distinction
   * transferReview() already draws for the parcel record itself.
   *
   * toOwnerId names a registered account, not a typed name — the only way
   * approval below can actually move Parcel.ownerId anywhere real. See
   * users.controller.ts's search() for how the citizen finds that account.
   */
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("citizen")
  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateMutationDto, @Req() req: Request) {
    const isCorrection = body.type === "correction";

    const [parcel, restrictions, policy, toOwner] = await Promise.all([
      this.prisma.parcel.findUnique({
        where: { id: body.parcelId },
        include: { owner: { select: { id: true, name: true, role: true } } },
      }),
      this.prisma.parcelRestriction.findMany({ where: { parcelId: body.parcelId } }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
      // Correction type: no new owner — the existing owner stays, so skip the lookup.
      isCorrection
        ? Promise.resolve(null)
        : this.prisma.user.findUnique({ where: { id: body.toOwnerId } }),
    ]);
    const actorId = currentUserId(req);
    // Same answer for "no such parcel" and "not yours" as land-admin and
    // disputes: only the recorded owner may start a transfer of their land.
    if (!parcel || parcel.ownerId !== actorId) throw new NotFoundError("Parcel not found");

    if (!isCorrection) {
      if (!toOwner || toOwner.role !== "citizen") {
        throw new NotFoundError("Recipient not found");
      }
    }

    const review = transferReview(restrictions as unknown as ParcelRestriction[]);
    if (!review.canTransfer) {
      throw new ValidationError(
        { code: "restricted", blockers: review.blockers.map((r) => r.type) },
        "parcelId",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Same fragile-but-consistent numbering as disputes/jurisdictions
      // elsewhere in this codebase: a running count, not a DB sequence. A
      // real deployment would want the latter; matching existing precedent
      // here rather than inventing a stronger scheme this one endpoint alone
      // would have.
      const count = await tx.mutation.count();
      const mutationNumber = `MUT-2026-${String(1300 + count).padStart(5, "0")}`;

      const feeMapping: Record<string, number> = {
        sale: 5400,
        inheritance: 2000,
        gift: 3000,
        correction: 1500,
        partition: 4500,
      };
      const calculatedFee = feeMapping[body.type] || policy?.mutationFeeBdt || 5400;

      const created = await tx.mutation.create({
        data: {
          id: `m-${randomUUID()}`,
          mutationNumber,
          parcelId: parcel.id,
          parcelDagNo: parcel.dagNo,
          type: body.type,
          status: "submitted",
          assignedOfficerId: "usr-officer", // Assigned to Nasrin Akter
          // The registry's own fact, not the applicant's claim — a citizen
          // does not get to assert who the current owner is.
          fromOwnerName: parcel.owner.name,
          fromOwnerId: parcel.ownerId,
          // For correction: ownership stays — toOwner is the same as fromOwner.
          toOwnerId: isCorrection ? parcel.ownerId : toOwner!.id,
          toOwnerName: isCorrection ? parcel.owner.name : toOwner!.name,
          requestedById: actorId,
          documentIds: body.documentIds ?? [],
          deedNumber: body.deedNumber,
          deedDate: body.deedDate ? new Date(body.deedDate) : undefined,
          metadata: (body.metadata as Prisma.InputJsonValue) ?? undefined,
          fee: { amount: calculatedFee, currency: "BDT" },
          paymentMethod: body.paymentMethod,
          // Simulated — no gateway is called. See PaymentMethod's own note.
          transactionId: `TXN-${randomUUID().slice(0, 8).toUpperCase()}`,
        },
      });

      await this.audit.append(tx, {
        entityType: "mutation",
        entityId: created.id,
        action: "create",
        actorId,
        payload: {
          mutationNumber: created.mutationNumber,
          parcelDagNo: created.parcelDagNo,
          toOwnerName: created.toOwnerName,
          newStatus: "submitted",
        },
      });

      const mutationTypeTitle = body.type.charAt(0).toUpperCase() + body.type.slice(1);
      
      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: actorId,
          at: new Date(),
          severity: "info",
          title: `${mutationTypeTitle} Namjari in verification`,
          body: `Your ${body.type} mutation ${created.mutationNumber} for dag ${created.parcelDagNo} is being verified.`,
          content: { code: "mutation-verification", mutationNumber: created.mutationNumber, dagNo: created.parcelDagNo },
          read: false,
          href: `/${body.type}`, // Dynamic link based on mutation type
        },
      });

      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: "usr-officer", // Nasrin Akter
          at: new Date(),
          severity: "warning",
          title: "New Mutation Assigned",
          body: `A new ${body.type} mutation ${created.mutationNumber} has been assigned to you.`,
          content: { code: "mutation-assigned", mutationNumber: created.mutationNumber, dagNo: created.parcelDagNo },
          read: false,
          href: `/mutations`, 
        },
      });

      return created;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  @Patch(":id/start-verification")
  async startVerification(@Param("id") id: string, @Req() req: Request) {
    return this.runAction(id, req, async (tx, { mutation, actor }, now) => {
      this.assertTransition(mutation, actor, now, "canStartVerification", ["submitted"]);
      if (mutation.documentIds.length === 0) {
        throw new ValidationError({ code: "supporting-documents-required" }, "documentIds");
      }
      const [documents, policy] = await Promise.all([
        tx.landDocument.findMany({ where: { id: { in: mutation.documentIds } } }),
        tx.policy.findUnique({ where: { id: "singleton" } }),
      ]);
      const missing = mutation.documentIds.filter((documentId) =>
        !documents.some((document) => document.id === documentId));
      if (missing.length) {
        throw new ValidationError({ code: "mutation-documents-missing", documentIds: missing }, "documentIds");
      }
      const documentReview = mutationDocumentGate(
        documents,
        "ocr",
        policy?.fraudScoreThreshold ?? 1,
      );
      if (!documentReview.ok) throw new ValidationError(documentReview.reason, "documentIds");
      const updated = await tx.mutation.update({
        where: {
          id,
          status: "submitted",
          assignedOfficerId: mutation.assignedOfficerId,
          updatedAt: mutation.updatedAt,
        },
        data: {
          status: "under-primary-verification", assignedOfficerId: actor.id,
          verificationStartedAt: now, verificationStartedById: actor.id,
        },
      });
      await this.audit.append(tx, {
        entityType: "mutation", entityId: id, action: "status-change", actorId: actor.id,
        payload: { previousStatus: mutation.status, newStatus: updated.status, actorRole: actor.role },
      });
      return updated;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  @Patch(":id/complete-verification")
  async completeVerification(
    @Param("id") id: string,
    @Body() body: CompleteVerificationDto,
    @Req() req: Request,
  ) {
    return this.runAction(id, req, async (tx, { mutation, actor }, now) => {
      this.assertTransition(mutation, actor, now, "canCompleteVerification", ["under-primary-verification"]);
      const checklist = {
        applicantVerified: body.applicantVerified, previousOwnerVerified: body.previousOwnerVerified,
        proposedOwnerVerified: body.proposedOwnerVerified, dagKhatianVerified: body.dagKhatianVerified,
        deedVerified: body.deedVerified, landRecordMatched: body.landRecordMatched, documentsPresent: body.documentsPresent,
        khajnaReceiptVerified: body.khajnaReceiptVerified,
      };
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";
      const verification = verificationGate(checklist, notes);
      if (!verification.ok) throw new ValidationError(verification.reason, "verification");
      const [recipient, documents] = await Promise.all([
        mutation.toOwnerId ? tx.user.findUnique({ where: { id: mutation.toOwnerId } }) : null,
        tx.landDocument.findMany({ where: { id: { in: mutation.documentIds } } }),
      ]);
      const references = mutationVerificationReferences(
        mutation as unknown as Mutation,
        recipient,
        documents,
      );
      if (!references.ok) {
        throw new ValidationError(
          references.reason,
          references.reason.code === "invalid-recipient" ? "toOwnerId" : "documentIds",
        );
      }
      const policy = await tx.policy.findUnique({ where: { id: "singleton" } });
      if (!policy || !Number.isInteger(policy.objectionWindowDays) || policy.objectionWindowDays < 0) {
        throw new ValidationError({ code: "objection-policy-unavailable" }, "verification");
      }
      const documentReview = mutationDocumentGate(documents, "officer", policy.fraudScoreThreshold);
      if (!documentReview.ok) throw new ValidationError(documentReview.reason, "documentIds");
      const updated = await tx.mutation.update({
        where: {
          id,
          status: "under-primary-verification",
          assignedOfficerId: mutation.assignedOfficerId,
          updatedAt: mutation.updatedAt,
        },
        data: {
          status: "under-primary-verification", assignedOfficerId: actor.id,
          verifiedAt: now, verifiedById: actor.id, verificationNotes: notes, verificationChecklist: checklist,
          objectionStartDate: now, objectionWindowEndsAt: new Date(now.getTime() + policy.objectionWindowDays * 86_400_000),
        },
      });
      await this.audit.append(tx, {
        entityType: "mutation", entityId: id, action: "status-change", actorId: actor.id,
        payload: { previousStatus: mutation.status, newStatus: updated.status, actorRole: actor.role, note: notes },
      });
      return updated;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  @Patch(":id/decision")
  async decide(
    @Param("id") id: string,
    @Body() body: MutationDecisionDto,
    @Req() req: Request,
  ) {
    return this.runAction(id, req, async (tx, { mutation, parcel, actor }, now) => {
      if (body.decision !== "approve" && body.decision !== "reject") {
        throw new ValidationError({ code: "invalid-decision" }, "decision");
      }
      const approving = body.decision === "approve";
      const dispute = mutation.disputeId
        ? await tx.dispute.findUnique({ where: { id: mutation.disputeId } })
        : null;
      this.assertTransition(mutation, actor, now, approving ? "canApprove" : "canReject",
        ["field-verification-complete"], dispute?.status);
      const filedFieldReport = await tx.fieldReport.findFirst({
        where: { mutationId: mutation.id, status: "completed" },
        orderBy: { submittedAt: "desc" },
      });
      if (!filedFieldReport) {
        throw new ValidationError({ code: "field-investigation-not-filed" }, "fieldReport");
      }
      if (filedFieldReport.disputeFound === true && !mutation.disputeId) {
        throw new ValidationError({ code: "dispute-details-required" }, "dispute");
      }
      const reason = typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : "";
      const note = typeof body.approvalNote === "string" ? body.approvalNote.trim() : undefined;
      const orderSheet = typeof body.orderSheet === "string" ? body.orderSheet.trim() : "";
      const digitalSignature = typeof body.digitalSignature === "string" ? body.digitalSignature.trim() : "";
      if (!approving && !reason) throw new ValidationError({ code: "rejection-reason-required" }, "rejectionReason");
      if (approving) {
        if (!orderSheet) throw new ValidationError({ code: "order-sheet-required" }, "orderSheet");
        if (!digitalSignature) throw new ValidationError({ code: "digital-signature-required" }, "digitalSignature");
        if (!mutation.fromOwnerId || parcel.ownerId !== mutation.fromOwnerId) {
          throw new ConflictError("The parcel owner has changed since this mutation was filed.");
        }
        const recipient = await tx.user.findUnique({ where: { id: mutation.toOwnerId! } });
        if (!recipient || recipient.role !== "citizen" || recipient.status !== "active") {
          throw new ValidationError({ code: "invalid-recipient" }, "toOwnerId");
        }
      }
      const updated = await tx.mutation.update({
        where: {
          id,
          status: mutation.status,
          assignedOfficerId: mutation.assignedOfficerId,
          updatedAt: mutation.updatedAt,
        },
        data: {
          assignedOfficerId: actor.id, decidedAt: now,
          ...(approving
            ? {
                status: "awaiting-dcr-payment", approvedAt: now, approvedById: actor.id,
                approvalNote: note, orderSheet, digitalSignature,
                mutationKhatianNumber: `MK-${now.getUTCFullYear()}-${updatedKhatianSequence(mutation.mutationNumber)}`,
              }
            : { status: "rejected", rejectedAt: now, rejectedById: actor.id, rejectionReason: reason }),
        },
      });

      if (approving) {
        const toOwnerId = mutation.toOwnerId!;
        await tx.parcel.update({
          where: { id: mutation.parcelId, ownerId: mutation.fromOwnerId! },
          data: { ownerId: toOwnerId, lastMutationAt: now },
        });

        // Chain of title: close whoever's record was open, open the new one.
        await tx.ownershipRecord.updateMany({
          where: { parcelId: mutation.parcelId, toDate: null },
          data: { toDate: now },
        });
        await tx.ownershipRecord.create({
          data: {
            id: `own-${randomUUID()}`,
            parcelId: mutation.parcelId,
            ownerId: toOwnerId,
            ownerName: updated.toOwnerName,
            acquisitionType: ACQUISITION_TYPE_BY_MUTATION_TYPE[mutation.type as MutationType],
            fromDate: now,
            documentId: mutation.documentIds[0],
            mutationId: id,
          },
        });
      }

      if (mutation.type === "sale") {
        await this.settleMarketplaceListing(tx, mutation, approving, actor.id, now);
      }

      await this.audit.append(tx, {
        entityType: "mutation",
        entityId: updated.id,
        action: body.decision,
        actorId: actor.id,
        payload: {
          mutationNumber: updated.mutationNumber,
          parcelDagNo: updated.parcelDagNo,
          toOwnerName: updated.toOwnerName,
          previousStatus: mutation.status,
          newStatus: updated.status,
          actorRole: actor.role,
          ...(approving ? (note ? { note } : {}) : { reason }),
        },
      });
      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: updated.requestedById,
          at: new Date(),
          severity: body.decision === "approve" ? "success" : "critical",
          title: body.decision === "approve" ? "Mutation approved" : "Mutation rejected",
          body: `Mutation ${updated.mutationNumber} for dag ${updated.parcelDagNo} has been ${body.decision}d.`,
          read: false,
          href: `/mutations?mutation=${updated.id}`,
        },
      });

      return updated;
    });
  }

  @UseGuards(AccessTokenGuard)
  @Patch(":id/dcr-payment")
  async recordDcrPayment(@Param("id") id: string, @Req() req: Request) {
    const actor = await loadMutationReadActor(this.prisma, req);
    const mutation = await this.prisma.mutation.findUnique({ where: { id } });
    if (!mutation) throw new NotFoundError("Mutation not found");
    if (actor.role === "citizen" && mutation.requestedById !== actor.id) {
      throw new ForbiddenException("You can only pay DCR for your own mutation.");
    }
    if (mutation.status !== "awaiting-dcr-payment") {
      throw new ValidationError({ code: "wrong-status", expected: ["awaiting-dcr-payment"] }, "status");
    }
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.mutation.update({
        where: { id, status: "awaiting-dcr-payment" },
        data: { status: "complete", dcrPaidAt: now, decidedAt: now },
      });
      await this.audit.append(tx, {
        entityType: "mutation", entityId: id, action: "dcr-paid", actorId: actor.id,
        payload: { previousStatus: "awaiting-dcr-payment", newStatus: "complete" },
      });
      return updated;
    });
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  @Patch(":id/flag-dispute")
  async flagDispute(
    @Param("id") id: string,
    @Body() body: { description?: string },
    @Req() req: Request,
  ) {
    return this.runAction(id, req, async (tx, { mutation, actor }, now) => {
      const description = body.description?.trim();
      if (!description) throw new ValidationError({ code: "dispute-description-required" }, "description");
      if (mutation.disputeId) throw new ConflictError("A dispute is already linked to this mutation.");
      if (mutation.status !== "field-verification-complete") {
        throw new ValidationError({ code: "wrong-status", expected: ["field-verification-complete"] }, "status");
      }
      const filedFieldReport = await tx.fieldReport.findFirst({
        where: { mutationId: mutation.id, status: "completed" },
        orderBy: { submittedAt: "desc" },
      });
      if (!filedFieldReport) {
        throw new ValidationError({ code: "field-investigation-not-filed" }, "fieldReport");
      }
      if (filedFieldReport.disputeFound !== true) {
        throw new ValidationError({ code: "no-dispute-reported" }, "fieldReport");
      }
      const [count, mediator, actorUser] = await Promise.all([
        tx.dispute.count(),
        tx.user.findFirst({ where: { role: "mediator", status: "active" } }),
        tx.user.findUnique({ where: { id: actor.id } }),
      ]);
      const dispute = await tx.dispute.create({
        data: {
          id: `ds-${randomUUID()}`,
          caseNumber: `DSP-${now.getUTCFullYear()}-${String(500 + count).padStart(5, "0")}`,
          parcelId: mutation.parcelId,
          parcelDagNo: mutation.parcelDagNo,
          type: "ownership",
          status: "in-mediation",
          priority: "high",
          filedById: actor.id,
          filedByName: actorUser?.name ?? actor.id,
          filedAt: now,
          description,
          parties: [{ name: mutation.fromOwnerName, role: "claimant" }, { name: mutation.toOwnerName, role: "respondent" }],
          assignedOfficerId: actor.id,
          assignedMediatorId: mediator?.id,
          evidenceDocumentIds: mutation.documentIds,
        },
      });
      const updated = await tx.mutation.update({ where: { id }, data: { disputeId: dispute.id } });
      await tx.disputeEvent.create({
        data: {
          id: `de-${randomUUID()}`,
          disputeId: dispute.id,
          at: now,
          type: "assigned",
          title: "Referred to mediation",
          content: mediator ? { code: "assigned", to: mediator.name } : { code: "status-change", status: "in-mediation" },
          description,
          actorId: actor.id,
          actorName: actorUser?.name,
        },
      });
      if (mediator) {
        await tx.appNotification.create({
          data: {
            id: `n-${randomUUID()}`,
            userId: mediator.id,
            at: now,
            severity: "warning",
            title: "Mutation dispute assigned",
            body: `Mutation ${mutation.mutationNumber} requires mediation before a final decision.`,
            content: { code: "dispute-assigned", caseNumber: dispute.caseNumber },
            read: false,
            href: "/cases",
          },
        });
      }
      await this.audit.append(tx, {
        entityType: "mutation", entityId: id, action: "dispute-filed", actorId: actor.id,
        payload: { caseNumber: dispute.caseNumber, previousStatus: mutation.status, newStatus: mutation.status, note: description },
      });
      return updated;
    });
  }

  private assertTransition(
    mutation: ActionContext["mutation"], actor: MutationActor, now: Date,
    action: "canStartVerification" | "canCompleteVerification" | "canApprove" | "canReject",
    expected: MutationStatus[],
    mediationStatus?: string | null,
  ) {
    const gate = mutationActionGate(
      mutation as unknown as Mutation,
      actor.id,
      now,
      mediationStatus as Parameters<typeof mutationActionGate>[3],
    );
    if (gate.hold?.code === "already-decided") throw new ConflictError("This mutation has already been decided.");
    if (!gate[action]) {
      const transitionAlreadyApplied =
        (action === "canStartVerification" && mutation.status !== "submitted") ||
        (action === "canCompleteVerification" && mutation.status !== "under-primary-verification");
      if (transitionAlreadyApplied) {
        throw new ConflictError("This mutation has already moved past that workflow transition.");
      }
      throw new ValidationError(gate.hold?.code === "wrong-status" || !gate.hold
        ? { code: "wrong-status", expected } : gate.hold, "status");
    }
  }

  /**
   * A sale filed from a marketplace listing settles that listing once the
   * land office decides. Matched by parcel plus the buyer whose interest the
   * seller accepted, so a sale the seller filed by hand after agreeing on the
   * marketplace settles too; a sale unrelated to any listing finds none.
   */
  private async settleMarketplaceListing(
    tx: Prisma.TransactionClient,
    mutation: { parcelId: string; toOwnerId: string | null; mutationNumber: string },
    approved: boolean,
    actorId: string,
    now: Date,
  ) {
    if (!mutation.toOwnerId) return;
    const listing = await tx.landListing.findFirst({
      where: {
        parcelId: mutation.parcelId,
        status: "under-transfer",
        inquiries: { some: { buyerId: mutation.toOwnerId, status: "accepted" } },
      },
      include: { inquiries: { where: { buyerId: mutation.toOwnerId, status: "accepted" } } },
    });
    if (!listing) return;

    const outcome = listingAfterMutationDecision(approved);
    await tx.landListing.update({ where: { id: listing.id }, data: { status: outcome.listing } });
    await tx.landListingInquiry.updateMany({
      where: { id: { in: listing.inquiries.map((i) => i.id) } },
      data: { status: outcome.acceptedInquiry },
    });
    await this.audit.append(tx, {
      entityType: "land-listing",
      entityId: listing.id,
      action: "status-change",
      actorId,
      payload: { from: "under-transfer", to: outcome.listing, mutationNumber: mutation.mutationNumber },
    });

    const notices = approved
      ? [
          { userId: listing.sellerId, title: "Listing sold", body: `The land office approved the transfer (${mutation.mutationNumber}). Your listing is marked sold.` },
          { userId: mutation.toOwnerId, title: "Purchase approved", body: `The land office approved the transfer (${mutation.mutationNumber}). The parcel is now recorded in your name.` },
        ]
      : [
          { userId: listing.sellerId, title: "Listing back on the market", body: `The land office rejected the transfer (${mutation.mutationNumber}), so your listing is active again.` },
          { userId: mutation.toOwnerId, title: "Purchase did not go through", body: `The land office rejected the transfer (${mutation.mutationNumber}). The listing has been reopened to other buyers.` },
        ];
    for (const notice of notices) {
      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: notice.userId,
          at: now,
          severity: approved ? "success" : "warning",
          title: notice.title,
          body: notice.body,
          read: false,
          href: `/marketplace/${listing.id}`,
        },
      });
    }
  }

  private async actionContext(client: Prisma.TransactionClient, id: string, actor: MutationActor) {
    const mutation = await client.mutation.findUnique({ where: { id } });
    if (!mutation) throw new NotFoundError("Mutation not found");
    assertMutationActionAccess(actor, mutation);
    const [parcel, jurisdictions] = await Promise.all([
      client.parcel.findUnique({ where: { id: mutation.parcelId } }),
      client.jurisdiction.findMany(),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (!coveredJurisdictionIds(actor, jurisdictions).has(parcel.jurisdictionId)) {
      throw new ForbiddenException("This mutation is outside your jurisdiction.");
    }
    return { mutation, parcel, actor };
  }

  private async runAction<T>(
    id: string, req: Request,
    action: (tx: Prisma.TransactionClient, context: ActionContext, now: Date) => Promise<T>,
  ): Promise<T> {
    const actor = await loadMutationActor(this.prisma, req);
    // Reject unauthorized writes before opening a transaction, then repeat
    // the checks from transaction state to close preflight races.
    await this.actionContext(this.prisma, id, actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
        if (!currentActor) throw new ForbiddenException("Land Office Staff access required.");
        assertLandOfficeActor(currentActor);
        const context = await this.actionContext(tx, id, currentActor);
        return action(tx, context, new Date());
      }, { isolationLevel: "ReadCommitted" });
    } catch (error) {
      // Conditional writes protect the full mutation snapshot (including
      // objections) and parcel ownership without a transaction-wide snapshot.
      // READ COMMITTED is intentional: AuditService takes the ledger
      // lock before reading the tail, which then gets a fresh statement snapshot.
      if (error && typeof error === "object" && "code" in error && ["P2025", "P2034"].includes(String(error.code))) {
        throw new ConflictError("This mutation changed while the action was being processed. Reload and try again.");
      }
      throw error;
    }
  }

  private async landOfficeListWhere(query: Record<string, string>, actor: MutationActor) {
    const jurisdictions = await this.prisma.jurisdiction.findMany();
    return {
      parcel: { jurisdictionId: { in: [...coveredJurisdictionIds(actor, jurisdictions)] } },
      ...(query.scope === "assigned" ? { assignedOfficerId: actor.id } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
  }
}

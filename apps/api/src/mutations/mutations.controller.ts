import { randomUUID } from "node:crypto";
import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import {
  ACQUISITION_TYPE_BY_MUTATION_TYPE,
  mutationActionGate,
  verificationGate,
  transferReview,
  type Mutation,
  type MutationType,
  type MutationStatus,
  type ParcelRestriction,
} from "@plotguard/rules";
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
  type MutationActor,
} from "./mutation-access";

function isLandOfficeRequest(req: Request): boolean {
  return req.header("x-plotguard-role") === "land-office";
}

function asMutationStatus(value: unknown): MutationStatus | undefined {
  return typeof value === "string" && ["submitted", "verification", "objection-period", "approved", "rejected"].includes(value)
    ? value as MutationStatus : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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
    const me = currentUserId(req);
    const where = isLandOfficeRequest(req)
      ? await this.landOfficeListWhere(query, req)
      : {
          ...(query.scope === "mine" ? { requestedById: me } : {}),
          ...(query.scope === "assigned" ? { assignedOfficerId: me } : {}),
          ...(query.status ? { status: query.status } : {}),
        };
    const all = await this.prisma.mutation.findMany({ where, orderBy: { requestedAt: "desc" } });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string, @Req() req: Request) {
    const mutation = await this.prisma.mutation.findUnique({ where: { id } });
    if (!mutation) throw new NotFoundError("Mutation not found");

    if (isLandOfficeRequest(req)) {
      const [actor, jurisdictions, parcel] = await Promise.all([
        loadMutationActor(this.prisma, req),
        this.prisma.jurisdiction.findMany(),
        this.prisma.parcel.findUnique({
          where: { id: mutation.parcelId },
          select: { jurisdictionId: true },
        }),
      ]);
      if (parcel && !coveredJurisdictionIds(actor, jurisdictions).has(parcel.jurisdictionId)) {
        throw new ForbiddenException("This mutation is outside your jurisdiction.");
      }
    }

    const [parcel, documents, applicant, assignedOfficer, events] = await Promise.all([
      findParcelView(this.prisma, mutation.parcelId),
      this.prisma.landDocument.findMany({ where: { id: { in: mutation.documentIds } } }),
      this.prisma.user.findUnique({
        where: { id: mutation.requestedById },
        select: { id: true, name: true, title: true },
      }),
      mutation.assignedOfficerId
        ? this.prisma.user.findUnique({
            where: { id: mutation.assignedOfficerId },
            select: { id: true, name: true, title: true },
          })
        : null,
      this.prisma.auditEvent.findMany({
        where: { entityType: "mutation", entityId: id },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      mutation, parcel, documents, applicant, assignedOfficer,
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
  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateMutationDto, @Req() req: Request) {
    const [parcel, restrictions, policy, toOwner] = await Promise.all([
      this.prisma.parcel.findUnique({
        where: { id: body.parcelId },
        include: { owner: { select: { name: true } } },
      }),
      this.prisma.parcelRestriction.findMany({ where: { parcelId: body.parcelId } }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
      this.prisma.user.findUnique({ where: { id: body.toOwnerId } }),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (!toOwner || toOwner.role !== "citizen") {
      throw new NotFoundError("Recipient not found");
    }

    const review = transferReview(restrictions as unknown as ParcelRestriction[]);
    if (!review.canTransfer) {
      throw new ValidationError(
        { code: "restricted", blockers: review.blockers.map((r) => r.type) },
        "parcelId",
      );
    }

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      // Same fragile-but-consistent numbering as disputes/jurisdictions
      // elsewhere in this codebase: a running count, not a DB sequence. A
      // real deployment would want the latter; matching existing precedent
      // here rather than inventing a stronger scheme this one endpoint alone
      // would have.
      const count = await tx.mutation.count();
      const mutationNumber = `MUT-2026-${String(1300 + count).padStart(5, "0")}`;

      const created = await tx.mutation.create({
        data: {
          id: `m-${randomUUID()}`,
          mutationNumber,
          parcelId: parcel.id,
          parcelDagNo: parcel.dagNo,
          type: body.type,
          status: "submitted",
          // The registry's own fact, not the applicant's claim — a citizen
          // does not get to assert who the current owner is.
          fromOwnerName: parcel.owner.name,
          fromOwnerId: parcel.ownerId,
          toOwnerId: toOwner.id,
          toOwnerName: toOwner.name,
          requestedById: actorId,
          documentIds: body.documentIds ?? [],
          deedNumber: body.deedNumber,
          deedDate: body.deedDate ? new Date(body.deedDate) : undefined,
          fee: policy ? { amount: policy.mutationFeeBdt, currency: "BDT" } : undefined,
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

      return created;
    });
  }

  @Patch(":id/start-verification")
  async startVerification(@Param("id") id: string, @Req() req: Request) {
    return this.runAction(id, req, async (tx, { mutation, actor }, now) => {
      this.assertTransition(mutation, actor, now, "canStartVerification", ["submitted"]);
      const updated = await tx.mutation.update({
        where: { id, status: "submitted", assignedOfficerId: mutation.assignedOfficerId },
        data: {
          status: "verification", assignedOfficerId: actor.id,
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

  @Patch(":id/complete-verification")
  async completeVerification(
    @Param("id") id: string,
    @Body() body: CompleteVerificationDto,
    @Req() req: Request,
  ) {
    return this.runAction(id, req, async (tx, { mutation, actor }, now) => {
      this.assertTransition(mutation, actor, now, "canCompleteVerification", ["verification"]);
      const checklist = {
        applicantVerified: body.applicantVerified, previousOwnerVerified: body.previousOwnerVerified,
        proposedOwnerVerified: body.proposedOwnerVerified, dagKhatianVerified: body.dagKhatianVerified,
        deedVerified: body.deedVerified, landRecordMatched: body.landRecordMatched, documentsPresent: body.documentsPresent,
      };
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";
      const verification = verificationGate(checklist, notes);
      if (!verification.ok) throw new ValidationError(verification.reason, "verification");
      const policy = await tx.policy.findUnique({ where: { id: "singleton" } });
      if (!policy || !Number.isInteger(policy.objectionWindowDays) || policy.objectionWindowDays < 0) {
        throw new ValidationError({ code: "objection-policy-unavailable" }, "verification");
      }
      const updated = await tx.mutation.update({
        where: { id, status: "verification", assignedOfficerId: mutation.assignedOfficerId },
        data: {
          status: "objection-period", assignedOfficerId: actor.id,
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
      this.assertTransition(mutation, actor, now, approving ? "canApprove" : "canReject",
        approving ? ["objection-period"] : ["submitted", "verification", "objection-period"]);
      const reason = typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : "";
      const note = typeof body.approvalNote === "string" ? body.approvalNote.trim() : undefined;
      if (!approving && !reason) throw new ValidationError({ code: "rejection-reason-required" }, "rejectionReason");
      if (approving) {
        // Legacy rows without a deadline cannot prove the objection window closed.
        if (!mutation.objectionWindowEndsAt) {
          throw new ValidationError({ code: "objection-window-missing" }, "decision");
        }
        if (!mutation.fromOwnerId || parcel.ownerId !== mutation.fromOwnerId) {
          throw new ConflictError("The parcel owner has changed since this mutation was filed.");
        }
        const recipient = await tx.user.findUnique({ where: { id: mutation.toOwnerId! } });
        if (!recipient || recipient.role !== "citizen" || recipient.status !== "active") {
          throw new ValidationError({ code: "invalid-recipient" }, "toOwnerId");
        }
      }
      const updated = await tx.mutation.update({
        where: { id, status: mutation.status, assignedOfficerId: mutation.assignedOfficerId },
        data: {
          assignedOfficerId: actor.id, decidedAt: now,
          ...(approving
            ? { status: "approved", approvedAt: now, approvedById: actor.id, approvalNote: note }
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
      return updated;
    });
  }

  private assertTransition(
    mutation: ActionContext["mutation"], actor: MutationActor, now: Date,
    action: "canStartVerification" | "canCompleteVerification" | "canApprove" | "canReject",
    expected: MutationStatus[],
  ) {
    const gate = mutationActionGate(mutation as unknown as Mutation, actor.id, now);
    if (gate.hold?.code === "already-decided") throw new ConflictError("This mutation has already been decided.");
    if (!gate[action]) {
      throw new ValidationError(gate.hold?.code === "wrong-status" || !gate.hold
        ? { code: "wrong-status", expected } : gate.hold, "status");
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
    // the checks against its snapshot to close preflight races.
    await this.actionContext(this.prisma, id, actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
        if (!currentActor) throw new ForbiddenException("Land Office Staff access required.");
        assertLandOfficeActor(currentActor);
        const context = await this.actionContext(tx, id, currentActor);
        return action(tx, context, new Date());
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      // Conditional updates protect transitions and parcel ownership; serializable
      // isolation also protects reads of objections, jurisdiction, and user state.
      if (error && typeof error === "object" && "code" in error && ["P2025", "P2034"].includes(String(error.code))) {
        throw new ConflictError("This mutation changed while the action was being processed. Reload and try again.");
      }
      throw error;
    }
  }

  private async landOfficeListWhere(query: Record<string, string>, req: Request) {
    const [actor, jurisdictions] = await Promise.all([
      loadMutationActor(this.prisma, req),
      this.prisma.jurisdiction.findMany(),
    ]);
    return {
      parcel: { jurisdictionId: { in: [...coveredJurisdictionIds(actor, jurisdictions)] } },
      ...(query.scope === "assigned" ? { assignedOfficerId: actor.id } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
  }
}

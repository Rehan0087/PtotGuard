import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { approvalGate, transferReview, type Mutation, type ParcelRestriction } from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";
import { MutationDecisionDto } from "./mutation-decision.dto";
import { CreateMutationDto } from "./create-mutation.dto";

@Controller("mutations")
export class MutationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const me = currentUserId(req);
    const where = {
      ...(query.scope === "mine" ? { requestedById: me } : {}),
      ...(query.scope === "assigned" ? { assignedOfficerId: me } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const all = await this.prisma.mutation.findMany({ where, orderBy: { requestedAt: "desc" } });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const mutation = await this.prisma.mutation.findUnique({ where: { id } });
    if (!mutation) throw new NotFoundError("Mutation not found");

    const [parcel, documents] = await Promise.all([
      findParcelView(this.prisma, mutation.parcelId),
      this.prisma.landDocument.findMany({ where: { id: { in: mutation.documentIds } } }),
    ]);
    return { mutation, parcel, documents };
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
   */
  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateMutationDto, @Req() req: Request) {
    const [parcel, restrictions, policy] = await Promise.all([
      this.prisma.parcel.findUnique({
        where: { id: body.parcelId },
        include: { owner: { select: { name: true } } },
      }),
      this.prisma.parcelRestriction.findMany({ where: { parcelId: body.parcelId } }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");

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
          toOwnerName: body.toOwnerName,
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
        },
      });

      return created;
    });
  }

  /**
   * approvalGate() ran client-side only in the mock (app/(app)/mutations/page.tsx
   * disables the button; lib/mocks/handlers.ts never checked it) — the exact
   * gap this codebase's own design principle warns against: a UI that
   * explains a hold is not a server that enforces one. Fixed here and in the
   * mock (parity), so a request that bypasses the disabled button still 422s.
   */
  @Patch(":id/decision")
  async decide(
    @Param("id") id: string,
    @Body() body: MutationDecisionDto,
    @Req() req: Request,
  ) {
    const mutation = await this.prisma.mutation.findUnique({ where: { id } });
    if (!mutation) throw new NotFoundError("Mutation not found");

    // approvalGate() models "already decided" as canApprove/canReject both
    // false with hold: null (its own callers check mutation.status instead,
    // to hide the buttons entirely) — so that case is refused here, before
    // the gate, rather than invented as a hold code the pure rule doesn't have.
    if (mutation.status === "approved" || mutation.status === "rejected") {
      throw new ConflictError("This mutation has already been decided.");
    }

    const gate = approvalGate(mutation as unknown as Mutation);
    const allowed = body.decision === "approve" ? gate.canApprove : gate.canReject;
    if (!allowed) throw new ValidationError(gate.hold!, "decision");

    const actorId = currentUserId(req);
    const status = body.decision === "approve" ? "approved" : "rejected";

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.mutation.update({
        where: { id },
        data: { status, decidedAt: new Date() },
      });
      await this.audit.append(tx, {
        entityType: "mutation",
        entityId: updated.id,
        action: body.decision,
        actorId,
        payload: {
          mutationNumber: updated.mutationNumber,
          parcelDagNo: updated.parcelDagNo,
          toOwnerName: updated.toOwnerName,
        },
      });
      return updated;
    });
  }
}

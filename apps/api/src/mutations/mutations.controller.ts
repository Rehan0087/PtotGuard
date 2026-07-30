import { Body, Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { approvalGate, type Mutation } from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";
import { MutationDecisionDto } from "./mutation-decision.dto";

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

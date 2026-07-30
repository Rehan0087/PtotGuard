import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { rulingGate, type Hearing } from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { CLOSED_DISPUTE_STATUSES } from "../parcels/parcel-view";
import { disputeAudience } from "../disputes/dispute-audience";
import { IssueRulingDto } from "./issue-ruling.dto";

@Controller("hearings")
export class HearingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const mediator = query.mediator === "me" ? currentUserId(req) : query.mediator;
    const where = {
      ...(mediator ? { mediatorId: mediator } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const all = await this.prisma.hearing.findMany({ where });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const hearing = await this.prisma.hearing.findUnique({ where: { id } });
    if (!hearing) throw new NotFoundError("Hearing not found");
    const dispute = await this.prisma.dispute.findUnique({ where: { id: hearing.disputeId } });
    return { hearing, dispute };
  }

  /**
   * The same gate the client shows (rulingGate()), so a hand-rolled request
   * can't enter a ruling against a party who was never heard. Unlike the
   * mutations decision gate, "already decided" is one of this gate's own
   * blocker codes (RulingBlocker), so no separate pre-check is needed here.
   */
  @Patch(":id/ruling")
  async issueRuling(
    @Param("id") id: string,
    @Body() body: IssueRulingDto,
    @Req() req: Request,
  ) {
    const hearing = await this.prisma.hearing.findUnique({ where: { id } });
    if (!hearing) throw new NotFoundError("Hearing not found");

    const review = rulingGate(hearing as unknown as Hearing, body.ruling ?? "");
    if (!review.canRule) throw new ValidationError(review.blockers[0], "ruling");

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.hearing.update({
        where: { id },
        data: { ruling: body.ruling, status: "ruled", ruledAt: now },
      });

      await this.audit.append(tx, {
        entityType: "hearing",
        entityId: updated.id,
        action: "ruling",
        actorId,
        payload: { caseNumber: updated.caseNumber, ruling: body.ruling },
      });

      // A ruling is what closes the dispute the hearing was convened over —
      // without this the case would sit in mediation forever with a decided
      // hearing hanging off it.
      const dispute = await tx.dispute.findUnique({ where: { id: hearing.disputeId } });
      if (dispute && !CLOSED_DISPUTE_STATUSES.includes(dispute.status)) {
        await tx.dispute.update({
          where: { id: dispute.id },
          // The ruling text is the resolution — record content, stored as typed.
          data: { status: "resolved", resolution: body.ruling, updatedAt: now },
        });
        await tx.disputeEvent.create({
          data: {
            id: `de-${randomUUID()}`,
            disputeId: dispute.id,
            at: now,
            type: "resolved",
            title: "Ruling issued",
            content: { code: "ruled" },
            description: body.ruling,
            actorId,
          },
        });

        // The people whose land it is find out from the app, not from the
        // mediator's own screen. The ruling text is deliberately not in the
        // notification: it is record content, and the case is where it is read.
        const audience = disputeAudience(
          { filedById: dispute.filedById, parties: dispute.parties as never },
          actorId,
        );
        if (audience.length > 0) {
          await tx.appNotification.createMany({
            data: audience.map((userId) => ({
              id: `n-${randomUUID()}`,
              userId,
              at: now,
              severity: "info",
              title: "Ruling issued",
              body: `A ruling has been issued on case ${dispute.caseNumber}.`,
              content: { code: "dispute-ruled", caseNumber: dispute.caseNumber },
              read: false,
              href: `/disputes/${dispute.id}`,
            })),
          });
        }
      }

      return updated;
    });
  }
}

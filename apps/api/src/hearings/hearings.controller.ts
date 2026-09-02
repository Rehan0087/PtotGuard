import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  rulingGate,
  type DisputeParty,
  type Hearing,
  type HearingSession,
} from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { CLOSED_DISPUTE_STATUSES } from "../parcels/parcel-view";
import { disputeAudience } from "../disputes/dispute-audience";
import { ConveneHearingDto } from "./convene-hearing.dto";
import { IssueRulingDto } from "./issue-ruling.dto";
import { RecordSessionDto } from "./record-session.dto";

/** A hearing still open to sittings — one of these blocks convening another. */
const OPEN_HEARING_STATUSES = ["scheduled", "in-hearing", "deliberation"];

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
   * Listing a referred case for hearing — the write the mediator's board
   * opened with and the real API never had, so Convene worked against the
   * mock and 404'd against Postgres.
   *
   * The parcel and the parties come off the dispute, not the request body:
   * the hearing is over that record, so re-sending them would only create a
   * way for the two to disagree.
   */
  @Post()
  @HttpCode(201)
  async convene(@Body() body: ConveneHearingDto, @Req() req: Request) {
    const mediatorId = currentUserId(req);
    const dispute = await this.prisma.dispute.findUnique({ where: { id: body.disputeId } });
    if (!dispute) throw new NotFoundError("Dispute not found");
    if (CLOSED_DISPUTE_STATUSES.includes(dispute.status)) {
      throw new ConflictError("This case is closed and cannot be listed for hearing.");
    }

    // The board already hides a case a colleague has listed; this is what
    // makes it true of the record rather than only of one mediator's screen.
    const existing = await this.prisma.hearing.findMany({ where: { disputeId: dispute.id } });
    if (existing.some((h) => OPEN_HEARING_STATUSES.includes(h.status))) {
      throw new ConflictError("This case is already listed for hearing.");
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const hearingDate = new Date(body.hearingDate);
      // Disjoint from the seeded case numbers (which run up to HRG-2026-0044)
      // — same running-count-plus-base-offset scheme as disputes/mutations.
      const count = await tx.hearing.count();
      const caseNumber = `HRG-2026-${String(1000 + count).padStart(4, "0")}`;
      const parties = (dispute.parties as unknown as DisputeParty[]).map((p) => p.name);

      const created = await tx.hearing.create({
        data: {
          id: `h-${randomUUID()}`,
          caseNumber,
          disputeId: dispute.id,
          parcelDagNo: dispute.parcelDagNo,
          mediatorId,
          status: "scheduled",
          parties: parties as never,
          hearingDate,
          sessions: [],
        },
      });

      await this.audit.append(tx, {
        entityType: "hearing",
        entityId: created.id,
        action: "create",
        actorId: mediatorId,
        payload: { caseNumber: created.caseNumber, parcelDagNo: created.parcelDagNo },
      });

      // Convening moves the case itself, the same way booking a survey does —
      // and claims it for this mediator, which is what puts it on their board.
      await tx.dispute.update({
        where: { id: dispute.id },
        data: {
          assignedMediatorId: mediatorId,
          status: "hearing-scheduled",
          hearingDate,
          updatedAt: now,
        },
      });

      await tx.disputeEvent.create({
        data: {
          id: `de-${randomUUID()}`,
          disputeId: dispute.id,
          at: now,
          type: "hearing",
          title: "Hearing scheduled",
          content: { code: "status-change", status: "hearing-scheduled" },
          actorId: mediatorId,
        },
      });

      // The parties learn their case has been listed from the app, not from
      // the mediator's own screen.
      const audience = disputeAudience(
        { filedById: dispute.filedById, parties: dispute.parties as never },
        mediatorId,
      );
      if (audience.length > 0) {
        await tx.appNotification.createMany({
          data: audience.map((userId) => ({
            id: `n-${randomUUID()}`,
            userId,
            at: now,
            severity: "info",
            title: "Hearing scheduled",
            body: `Case ${dispute.caseNumber} has been listed for hearing by the mediator.`,
            content: { code: "hearing-scheduled", caseNumber: dispute.caseNumber },
            read: false,
            href: `/disputes/${dispute.id}`,
          })),
        });
      }

      return created;
    });
  }

  /**
   * Additive to the frozen spec: recording what happened in a sitting.
   * rulingGate() reads these, so this is the write that unblocks a decision —
   * a case can't be ruled on until at least one sitting exists and every
   * party has attended one.
   *
   * No audit entry, matching the mock: a sitting is a step *toward* a
   * decision, not a decision. The ruling that follows is what gets recorded
   * on the ledger, and it carries the sittings with it.
   */
  @Post(":id/sessions")
  @HttpCode(201)
  async recordSession(
    @Param("id") id: string,
    @Body() body: RecordSessionDto,
    @Req() req: Request,
  ) {
    const hearing = await this.prisma.hearing.findUnique({ where: { id } });
    if (!hearing) throw new NotFoundError("Hearing not found");

    // A decided case takes no further sittings. The screen already hides the
    // form; this is what makes it true of the record and not just the UI.
    if (hearing.status === "ruled" || hearing.status === "appealed") {
      throw new ValidationError({ code: "already-decided" }, "status");
    }

    const summary = body.summary.trim();
    if (!summary) throw new ValidationError({ code: "need-summary" }, "summary");

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const sessions = hearing.sessions as unknown as HearingSession[];
      const session: HearingSession = {
        id: `s-${randomUUID()}`,
        at: now.toISOString(),
        summary,
        attendees: body.attendees ?? [],
      };

      const updated = await tx.hearing.update({
        where: { id },
        data: {
          sessions: [...sessions, session] as never,
          // A case with a sitting on record is being heard, not merely scheduled.
          ...(hearing.status === "scheduled" ? { status: "in-hearing" } : {}),
        },
      });

      // A sitting is a public step in the case, so it belongs on the tracking
      // timeline the citizen watches — not only in the mediator's own view.
      const dispute = await tx.dispute.findUnique({ where: { id: hearing.disputeId } });
      if (dispute && !CLOSED_DISPUTE_STATUSES.includes(dispute.status)) {
        await tx.dispute.update({
          where: { id: dispute.id },
          data: { status: "in-mediation", updatedAt: now },
        });
        await tx.disputeEvent.create({
          data: {
            id: `de-${randomUUID()}`,
            disputeId: dispute.id,
            at: now,
            type: "hearing",
            title: "Hearing held",
            content: { code: "hearing-held", ordinal: sessions.length + 1 },
            // The mediator's summary is record content — carried across as typed.
            description: summary,
            actorId,
          },
        });
      }

      return updated;
    });
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

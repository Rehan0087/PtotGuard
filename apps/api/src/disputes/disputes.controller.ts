import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  activeRestrictions,
  executionGate,
  registryStatusAfter,
  routeDisputeToOfficer,
  type Dispute,
  type DisputeParty,
  type Jurisdiction,
  type ParcelRestriction,
  type RulingOutcome,
  type User,
} from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";
import { disputeAudience } from "./dispute-audience";
import { CreateDisputeDto } from "./create-dispute.dto";
import { ExecuteRulingDto } from "./execute-ruling.dto";

function toOutcome(body: ExecuteRulingDto): RulingOutcome {
  switch (body.action) {
    case "restriction-added":
      return {
        action: "restriction-added",
        restrictionType: body.restrictionType!,
        authority: body.authority ?? "",
        note: body.note,
      };
    case "restriction-removed":
      return { action: "restriction-removed", restrictionId: body.restrictionId ?? "" };
    case "referred-to-mutation":
      return { action: "referred-to-mutation" };
    default:
      return { action: "no-change" };
  }
}

@Controller("disputes")
export class DisputesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const q = query.q?.toLowerCase();
    const me = currentUserId(req);
    const where = {
      ...(query.scope === "mine" ? { filedById: me } : {}),
      ...(query.scope === "assigned"
        ? { OR: [{ assignedOfficerId: me }, { assignedMediatorId: me }, { assignedAgentId: me }] }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { caseNumber: { contains: q, mode: "insensitive" as const } },
              { parcelDagNo: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const all = await this.prisma.dispute.findMany({ where, orderBy: { filedAt: "desc" } });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundError("Dispute not found");

    const [timeline, parcel, evidence, restrictions] = await Promise.all([
      this.prisma.disputeEvent.findMany({ where: { disputeId: id }, orderBy: { at: "asc" } }),
      findParcelView(this.prisma, dispute.parcelId),
      this.prisma.landDocument.findMany({
        where: { id: { in: dispute.evidenceDocumentIds } },
      }),
      this.prisma.parcelRestriction.findMany({ where: { parcelId: dispute.parcelId } }),
    ]);

    // Only what execute() needs to offer: the restrictions currently in
    // force on this parcel, so "restriction-removed" can only target one
    // that's real and active — same rule the endpoint itself enforces.
    const activeParcelRestrictions = activeRestrictions(
      restrictions as unknown as ParcelRestriction[],
    );

    return { dispute, timeline, parcel, evidence, activeRestrictions: activeParcelRestrictions };
  }

  /**
   * Citizen filing — additive to the frozen spec, and this controller's
   * first write of any kind (it was @Get-only before this). Ownership-
   * checked like land-admin/land-tax: the wizard's own picker only offers
   * "my properties", so filing about a parcel that isn't the caller's own
   * gets the same NotFoundError as one that doesn't exist.
   *
   * Routed to a land-office officer by jurisdiction (routeDisputeToOfficer())
   * — the one piece of the citizen spec ("routes the file based on
   * jurisdiction") that was never actually implemented anywhere:
   * `assignedOfficerId` existed on the schema but had no writer.
   */
  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateDisputeDto, @Req() req: Request) {
    const actorId = currentUserId(req);
    const parcel = await this.prisma.parcel.findUnique({ where: { id: body.parcelId } });
    if (!parcel || parcel.ownerId !== actorId) throw new NotFoundError("Parcel not found");

    const [filer, officers, jurisdictions] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actorId } }),
      this.prisma.user.findMany({ where: { role: "land-office" } }),
      this.prisma.jurisdiction.findMany(),
    ]);
    if (!filer) throw new NotFoundError("User not found");

    const officer = routeDisputeToOfficer(
      parcel.jurisdictionId,
      officers as unknown as User[],
      jurisdictions as unknown as Jurisdiction[],
    );

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Disjoint from the seeded case numbers (which run up to DSP-2026-00417)
      // — same running-count-plus-base-offset scheme as mutations/land-admin.
      const count = await tx.dispute.count();
      const caseNumber = `DSP-2026-${String(1000 + count).padStart(5, "0")}`;

      const parties: DisputeParty[] = [
        { name: filer.name, role: "claimant", userId: filer.id },
        ...(body.respondentName?.trim()
          ? [{ name: body.respondentName.trim(), role: "respondent" as const }]
          : []),
      ];

      const created = await tx.dispute.create({
        data: {
          id: `ds-${randomUUID()}`,
          caseNumber,
          parcelId: parcel.id,
          parcelDagNo: parcel.dagNo,
          type: body.type,
          status: "submitted",
          priority: body.priority,
          filedById: filer.id,
          filedByName: filer.name,
          filedAt: now,
          description: body.description,
          parties: parties as never,
          assignedOfficerId: officer?.id,
          evidenceDocumentIds: [],
          updatedAt: now,
        },
      });

      // The record's own signal that its facts are contested — the
      // counterpart to execute()'s registryStatusAfter(), which is what
      // eventually clears this back once the case is resolved.
      await tx.parcel.update({
        where: { id: parcel.id },
        data: { registryStatus: "disputed" },
      });

      await this.audit.append(tx, {
        entityType: "dispute",
        entityId: created.id,
        action: "create",
        actorId,
        payload: {
          caseNumber: created.caseNumber,
          parcelDagNo: created.parcelDagNo,
          type: created.type,
        },
      });

      await tx.disputeEvent.create({
        data: {
          id: `de-${randomUUID()}`,
          disputeId: created.id,
          at: now,
          type: "filed",
          title: "Dispute filed",
          content: { code: "filed" },
          actorId,
        },
      });

      if (officer) {
        await tx.appNotification.create({
          data: {
            id: `n-${randomUUID()}`,
            userId: officer.id,
            at: now,
            severity: "info",
            title: "New dispute assigned",
            body: `${created.caseNumber} requires review.`,
            content: { code: "dispute-assigned", caseNumber: created.caseNumber },
            read: false,
            href: `/disputes/${created.id}`,
          },
        });
      }

      return created;
    });
  }

  /**
   * The step a ruling used to stop short of: turning "resolved" into an
   * actual change on the parcel record. `executionGate()` is the same gate
   * the officer's screen shows, so a hand-rolled request can't apply an
   * outcome to a case that isn't resolved yet, or apply a second one to a
   * case already executed.
   *
   * Deliberately does not touch `Parcel.ownerId` under any outcome — see
   * execution.ts's own note. `referred-to-mutation` is how an ownership
   * ruling is executed: it unblocks the record for the real transfer
   * channel rather than reimplementing one here.
   */
  @Patch(":id/execute")
  async execute(@Param("id") id: string, @Body() body: ExecuteRulingDto, @Req() req: Request) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundError("Dispute not found");

    const restrictions = await this.prisma.parcelRestriction.findMany({
      where: { parcelId: dispute.parcelId },
    });
    const active = activeRestrictions(restrictions as unknown as ParcelRestriction[]);
    const activeIds = active.map((r) => r.id);

    const outcome = toOutcome(body);
    const review = executionGate(dispute as unknown as Dispute, outcome, activeIds);
    if (!review.canExecute) throw new ValidationError(review.blockers[0], "action");

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      if (outcome.action === "restriction-added") {
        await tx.parcelRestriction.create({
          data: {
            id: `pr-${randomUUID()}`,
            parcelId: dispute.parcelId,
            type: outcome.restrictionType,
            authority: outcome.authority,
            referenceNo: dispute.caseNumber,
            note: outcome.note,
            fromDate: now,
          },
        });
      } else if (outcome.action === "restriction-removed") {
        await tx.parcelRestriction.update({
          where: { id: outcome.restrictionId },
          data: { toDate: now },
        });
      }

      const remaining =
        outcome.action === "restriction-removed"
          ? activeIds.filter((rid) => rid !== outcome.restrictionId).length
          : activeIds.length;
      const registryStatus = registryStatusAfter(outcome, remaining);
      await tx.parcel.update({ where: { id: dispute.parcelId }, data: { registryStatus } });

      const updated = await tx.dispute.update({
        where: { id },
        data: { recordsExecutedAt: now, recordsExecutedById: actorId },
      });

      await this.audit.append(tx, {
        entityType: "dispute",
        entityId: dispute.id,
        action: "execute-ruling",
        actorId,
        payload: { caseNumber: dispute.caseNumber, outcome: outcome.action, registryStatus },
      });

      await tx.disputeEvent.create({
        data: {
          id: `de-${randomUUID()}`,
          disputeId: dispute.id,
          at: now,
          type: "records-executed",
          title: "Records updated",
          content: { code: "records-executed", action: outcome.action },
          actorId,
        },
      });

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
            title: "Land record updated",
            body: `The land record for case ${dispute.caseNumber} has been updated to reflect the ruling.`,
            content: { code: "dispute-executed", caseNumber: dispute.caseNumber },
            read: false,
            href: `/disputes/${dispute.id}`,
          })),
        });
      }

      return updated;
    });
  }
}

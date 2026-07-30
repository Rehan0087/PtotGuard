import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";

@Controller("disputes")
export class DisputesController {
  constructor(private readonly prisma: PrismaService) {}

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

    const [timeline, parcel, evidence] = await Promise.all([
      this.prisma.disputeEvent.findMany({ where: { disputeId: id }, orderBy: { at: "asc" } }),
      findParcelView(this.prisma, dispute.parcelId),
      this.prisma.landDocument.findMany({
        where: { id: { in: dispute.evidenceDocumentIds } },
      }),
    ]);

    return { dispute, timeline, parcel, evidence };
  }
}

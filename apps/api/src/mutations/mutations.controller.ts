import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";

@Controller("mutations")
export class MutationsController {
  constructor(private readonly prisma: PrismaService) {}

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
}

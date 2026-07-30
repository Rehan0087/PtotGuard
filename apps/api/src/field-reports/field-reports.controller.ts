import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { findParcelView } from "../parcels/parcel-view";

@Controller("field-reports")
export class FieldReportsController {
  constructor(private readonly prisma: PrismaService) {}

  // Declared before ":id" — Nest matches routes in registration order, and a
  // dynamic segment would otherwise swallow the literal path "assigned".
  @Get("assigned")
  assigned(@Req() req: Request) {
    return this.prisma.fieldReport.findMany({
      where: { assignedAgentId: currentUserId(req) },
      orderBy: { scheduledFor: "asc" },
    });
  }

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const agent = query.agent === "me" ? currentUserId(req) : query.agent;
    const where = {
      ...(agent ? { assignedAgentId: agent } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const all = await this.prisma.fieldReport.findMany({
      where,
      orderBy: { scheduledFor: "asc" },
    });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const report = await this.prisma.fieldReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundError("Field report not found");
    return { report, parcel: await findParcelView(this.prisma, report.parcelId) };
  }
}

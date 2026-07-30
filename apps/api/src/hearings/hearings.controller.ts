import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";

@Controller("hearings")
export class HearingsController {
  constructor(private readonly prisma: PrismaService) {}

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
}

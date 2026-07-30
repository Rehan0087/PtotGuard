import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const owner = query.owner === "me" ? currentUserId(req) : query.owner;
    const where = {
      ...(owner ? { ownerId: owner } : {}),
      // fraud=true means "awaiting fraud review": still flagged, not yet decided.
      ...(query.fraud === "true" ? { verificationStatus: "flagged" } : {}),
      ...(query.ocr ? { ocrStatus: query.ocr } : {}),
    };
    const all = await this.prisma.landDocument.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
    });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const doc = await this.prisma.landDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundError("Document not found");
    return doc;
  }
}

import { Controller, Get, Param } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { verifyChain } from "./audit-hash";

@Controller("audit")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  // Declared before ":entityType/:id" for the same reason field-reports
  // orders "assigned" first — a literal path ahead of any route that could
  // shadow it, even though a two-segment dynamic route couldn't here.
  @Get("verify")
  async verify() {
    // Chain order is createdAt ascending — the order links were appended in.
    const events = await this.prisma.auditEvent.findMany({ orderBy: { createdAt: "asc" } });
    return verifyChain(events);
  }

  /** Full ledger (admin). Additive to the frozen spec's per-entity + verify routes. */
  @Get()
  list() {
    return this.prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" } });
  }

  @Get(":entityType/:id")
  forEntity(@Param("entityType") entityType: string, @Param("id") id: string) {
    return this.prisma.auditEvent.findMany({
      where: { entityType, entityId: id },
      orderBy: { createdAt: "desc" },
    });
  }
}

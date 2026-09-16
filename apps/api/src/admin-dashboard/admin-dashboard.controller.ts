import { Controller, Get, UseGuards } from "@nestjs/common";
import type { AdminDashboard, Role } from "@plotguard/rules";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";

// Same vocabularies the land-office dashboard counts against, so the two
// screens cannot disagree about what "open" means.
const TERMINAL_MUTATIONS = ["complete", "rejected"];
const CLOSED_DISPUTES = ["resolved", "rejected", "withdrawn"];
const CLOSED_SERVICES = ["approved", "rejected", "withdrawn"];
const CLOSED_FIELD_REPORTS = ["completed", "cancelled"];
const OPEN_HEARINGS = ["scheduled", "in-hearing", "deliberation"];

const ROLES: Role[] = ["citizen", "land-office", "field-agent", "mediator", "admin"];

/**
 * The administrator's landing view. Counts, not queues: an administrator
 * governs the system rather than working its cases, so every number here is
 * a door into the screen that does the work.
 *
 * Deliberately does not verify the audit chain. Verification walks every
 * event in the ledger, and a page that loads on every visit is the wrong
 * place for unbounded work — the audit screen keeps that button.
 */
@Controller("admin/dashboard")
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles("admin")
export class AdminDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async dashboard(): Promise<AdminDashboard> {
    const [
      serviceApplications,
      mutations,
      disputes,
      hearings,
      fieldReports,
      documentsToVerify,
      byStatus,
      byRole,
      ledgerEvents,
      newestEvent,
      recentAudit,
      jurisdictionCount,
    ] = await Promise.all([
      this.prisma.serviceApplication.count({ where: { status: { notIn: CLOSED_SERVICES } } }),
      this.prisma.mutation.count({ where: { status: { notIn: TERMINAL_MUTATIONS } } }),
      this.prisma.dispute.count({ where: { status: { notIn: CLOSED_DISPUTES } } }),
      this.prisma.hearing.count({ where: { status: { in: OPEN_HEARINGS } } }),
      this.prisma.fieldReport.count({ where: { status: { notIn: CLOSED_FIELD_REPORTS } } }),
      this.prisma.landDocument.count({ where: { verificationStatus: "unverified" } }),
      this.prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      this.prisma.auditEvent.count(),
      this.prisma.auditEvent.findFirst({ orderBy: { createdAt: "desc" } }),
      this.prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      this.prisma.jurisdiction.count(),
    ]);

    const statusCount = (status: string) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    return {
      queues: {
        serviceApplications,
        mutations,
        disputes,
        hearings,
        fieldReports,
        documentsToVerify,
      },
      accounts: {
        total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
        active: statusCount("active"),
        suspended: statusCount("suspended"),
        invited: statusCount("invited"),
        byRole: Object.fromEntries(
          ROLES.map((role) => [role, byRole.find((r) => r.role === role)?._count._all ?? 0]),
        ) as Record<Role, number>,
      },
      ledger: {
        events: ledgerEvents,
        ...(newestEvent ? { lastAt: newestEvent.createdAt.toISOString() } : {}),
      },
      jurisdictionCount,
      recentAudit: recentAudit as unknown as AdminDashboard["recentAudit"],
    };
  }
}

import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import type { ServiceType } from "@plotguard/rules";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { coveredJurisdictionIds, loadMutationActor } from "../mutations/mutation-access";
import { PrismaService } from "../prisma/prisma.service";

const TERMINAL_MUTATIONS = ["complete", "rejected"];
const CLOSED_DISPUTES = ["resolved", "rejected", "withdrawn"];
const CLOSED_SERVICES = ["approved", "rejected", "withdrawn"];
const CLOSED_FIELD_REPORTS = ["completed", "cancelled"];

@Controller("land-office/dashboard")
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles("land-office")
export class LandOfficeDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async dashboard(@Req() req: Request) {
    const officer = await loadMutationActor(this.prisma, req);
    const jurisdictions = await this.prisma.jurisdiction.findMany();
    const covered = [...coveredJurisdictionIds(officer, jurisdictions)];
    const parcelScope = { jurisdictionId: { in: covered } };

    const [profile, jurisdiction, parcels, mutations, disputes, documents, fieldReports, services, activity] =
      await Promise.all([
        this.prisma.user.findUnique({ where: { id: officer.id } }),
        this.prisma.jurisdiction.findUnique({ where: { id: officer.jurisdictionId } }),
        this.prisma.parcel.findMany({ where: parcelScope, select: { id: true } }),
        this.prisma.mutation.findMany({
          where: { parcel: parcelScope },
          orderBy: { requestedAt: "desc" },
        }),
        this.prisma.dispute.findMany({
          where: { parcel: parcelScope },
          orderBy: { filedAt: "desc" },
        }),
        this.prisma.landDocument.findMany({
          where: {
            OR: [
              { parcel: parcelScope },
              { parcelId: null, owner: { jurisdictionId: { in: covered } } },
            ],
          },
          orderBy: { uploadedAt: "desc" },
        }),
        this.prisma.fieldReport.findMany({
          where: { parcel: parcelScope },
          orderBy: { assignedAt: "desc" },
        }),
        this.prisma.serviceApplication.findMany({
          where: {
            OR: [
              { assignedOfficerId: officer.id },
              { parcel: parcelScope },
              { applicant: { jurisdictionId: { in: covered } } },
            ],
          },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.auditEvent.findMany({
          where: { actorId: officer.id },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
      ]);

    const activeMutations = mutations.filter((item) => !TERMINAL_MUTATIONS.includes(item.status));
    const openDisputes = disputes.filter((item) => !CLOSED_DISPUTES.includes(item.status));
    const reviewDocuments = documents.filter(
      (item) => item.ocrStatus === "extracted" && item.verificationStatus === "unverified",
    );
    const flaggedDocuments = documents.filter((item) => item.verificationStatus === "flagged");
    const liveMutationVisits = new Set(
      fieldReports
        .filter((report) => report.mutationId && report.status !== "cancelled")
        .map((report) => report.mutationId),
    );
    const needsAgent = activeMutations.filter(
      (item) => item.status === "field-investigation" && !liveMutationVisits.has(item.id),
    );
    const activeFieldReports = fieldReports.filter((item) => !CLOSED_FIELD_REPORTS.includes(item.status));
    const openServices = services.filter((item) => !CLOSED_SERVICES.includes(item.status));
    const serviceCounts = openServices.reduce<Partial<Record<ServiceType, number>>>((counts, item) => {
      const type = item.serviceType as ServiceType;
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {});

    return {
      officer: {
        id: officer.id,
        name: profile?.name ?? officer.id,
        ...(profile?.title ? { title: profile.title } : {}),
        jurisdictionId: officer.jurisdictionId,
        jurisdictionName: jurisdiction?.name ?? officer.jurisdictionId,
      },
      summary: {
        recordCount: parcels.length,
        activeMutationCount: activeMutations.length,
        primaryVerificationCount: activeMutations.filter((item) => item.status === "under-primary-verification").length,
        openDisputeCount: openDisputes.length,
        documentsToReviewCount: reviewDocuments.length,
        fraudFlagCount: flaggedDocuments.length,
        needsAgentCount: needsAgent.length,
        activeFieldVisitCount: activeFieldReports.length,
        openServiceCount: openServices.length,
      },
      queues: {
        mutations: activeMutations.slice(0, 5),
        disputes: openDisputes.slice(0, 5),
        documents: [...flaggedDocuments, ...reviewDocuments]
          .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
          .slice(0, 5),
        fieldReports: activeFieldReports.slice(0, 5),
      },
      serviceCounts,
      recentActivity: activity,
    };
  }
}

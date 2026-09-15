import { Controller, ForbiddenException, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  ACTIVE_MUTATION_STATUSES,
  ancestryOf,
  maskNationalId,
  normaliseUlpin,
  recordRegistryStatus,
  toPublicParcel,
  transferReview,
  type Jurisdiction,
  type MutationStatus,
  type ParcelRestriction,
} from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { currentUserId, type AuthenticatedRequest } from "../auth/dev-current-user";
import { NotFoundError } from "../common/domain-exceptions";
import { pageParams, paginated } from "../common/pagination";
import { type GeoPoint, distance, openDisputeCounts, toParcel } from "./parcel-view";
import { coveredJurisdictionIds, loadMutationActor } from "../mutations/mutation-access";

@Controller("parcels")
export class ParcelsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const owner = query.owner === "me" ? currentUserId(req) : query.owner;
    const dag = query.dag?.toLowerCase();
    const khatian = query.khatian?.toLowerCase();
    const q = query.q?.trim().toLowerCase();
    const bbox = query.bbox?.split(",").map(Number);
    const requestRole = (req as AuthenticatedRequest).user?.role ?? req.header("x-plotguard-role");
    const officeJurisdictionIds = requestRole === "land-office"
      ? await this.landOfficeJurisdictionIds(req)
      : undefined;
    const activeMutationFilter = {
      status: { in: [...ACTIVE_MUTATION_STATUSES] },
    };
    const where = {
      ...(officeJurisdictionIds ? { jurisdictionId: { in: officeJurisdictionIds } } : {}),
      ...(owner ? { ownerId: owner } : {}),
      ...(dag ? { dagNo: { contains: dag, mode: "insensitive" as const } } : {}),
      ...(khatian ? { khatianNo: { contains: khatian, mode: "insensitive" as const } } : {}),
      // Exact, not `contains`: a ULPIN is an identifier being cited, so a
      // near-miss should return nothing rather than a plausible wrong plot.
      ...(query.ulpin ? { ulpin: normaliseUlpin(query.ulpin) } : {}),
      ...(q
        ? {
            OR: [
              { dagNo: { contains: q, mode: "insensitive" as const } },
              { khatianNo: { contains: q, mode: "insensitive" as const } },
              { title: { contains: q, mode: "insensitive" as const } },
              { owner: { name: { contains: q, mode: "insensitive" as const } } },
              // A citizen pasting an identifier into the one search box should
              // land on it, without having to know which field it belongs to.
              { ulpin: { contains: normaliseUlpin(q), mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.parcel.findMany({
      where,
      include: {
        owner: { select: { name: true } },
        mutations: {
          where: activeMutationFilter,
          select: { status: true, disputeId: true },
        },
        documents: {
          where: { verificationStatus: "flagged" },
          select: { id: true },
          take: 1,
        },
      },
    });

    // bbox has no direct Prisma equivalent for a Json centroid column — filter
    // in JS. Fine at this dataset size; move into `where` with a PostGIS
    // geography column if parcel volume ever makes that the bottleneck.
    const filtered = bbox
      ? rows.filter((p) => {
          const c = p.centroid as GeoPoint;
          const [minLng, minLat, maxLng, maxLat] = bbox;
          return c.lng >= minLng && c.lng <= maxLng && c.lat >= minLat && c.lat <= maxLat;
        })
      : rows;

    const counts = await openDisputeCounts(this.prisma, filtered.map((p) => p.id));
    const items = filtered.map(({ mutations = [], documents = [], ...parcel }) => {
      const view = toParcel(parcel, counts.get(parcel.id) ?? 0);
      return {
        ...view,
        registryStatus: recordRegistryStatus(
          mutations as { status: MutationStatus; disputeId?: string | null }[],
          view.openDisputeCount,
          documents.length > 0,
        ),
      };
    });

    const statusFiltered = query.status
      ? items.filter((item) => item.registryStatus === query.status)
      : items;

    const params = pageParams(query);
    const page = statusFiltered.slice(params.skip, params.skip + params.take);
    return paginated(page, statusFiltered.length, params);
  }

  /** Office-only aggregate; the Citizen Portal continues to use GET /parcels/:id. */
  @Get(":id/record")
  async record(@Param("id") id: string, @Req() req: Request) {
    const actor = await loadMutationActor(this.prisma, req);
    const [parcel, jurisdictions] = await Promise.all([
      this.prisma.parcel.findUnique({
        where: { id },
        include: {
          owner: {
            select: { id: true, name: true, nationalId: true, profileDetails: true },
          },
        },
      }),
      this.prisma.jurisdiction.findMany(),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");

    const covered = coveredJurisdictionIds(actor, jurisdictions);
    if (!covered.has(parcel.jurisdictionId)) {
      throw new ForbiddenException("This land record is outside your jurisdiction.");
    }

    const [ownershipRows, mutationRows, documents, disputes, restrictions] = await Promise.all([
      this.prisma.ownershipRecord.findMany({
        where: { parcelId: id },
        include: {
          mutation: {
            select: { id: true, mutationNumber: true, status: true, type: true },
          },
        },
        orderBy: { fromDate: "desc" },
      }),
      this.prisma.mutation.findMany({
        where: { parcelId: id },
        include: {
          requestedBy: { select: { name: true } },
          assignedOfficer: { select: { name: true } },
          approvedBy: { select: { name: true } },
          rejectedBy: { select: { name: true } },
        },
        orderBy: { requestedAt: "desc" },
      }),
      this.prisma.landDocument.findMany({
        where: { parcelId: id },
        orderBy: { uploadedAt: "desc" },
      }),
      this.prisma.dispute.findMany({
        where: { parcelId: id },
        orderBy: { filedAt: "desc" },
      }),
      this.prisma.parcelRestriction.findMany({
        where: { parcelId: id },
        orderBy: { fromDate: "desc" },
      }),
    ]);

    const mutationIds = mutationRows.map((mutation) => mutation.id);
    const disputeIds = disputes.map((dispute) => dispute.id);
    const documentIds = documents.map((document) => document.id);
    const audit = await this.prisma.auditEvent.findMany({
      where: {
        OR: [
          { entityType: "parcel", entityId: id },
          ...(mutationIds.length > 0
            ? [{ entityType: "mutation", entityId: { in: mutationIds } }]
            : []),
          ...(disputeIds.length > 0
            ? [{ entityType: "dispute", entityId: { in: disputeIds } }]
            : []),
          ...(documentIds.length > 0
            ? [{ entityType: "document", entityId: { in: documentIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const documentById = new Map(documents.map((document) => [document.id, document]));
    const ownership = ownershipRows.map(({ mutation, ...entry }) => {
      const document = entry.documentId ? documentById.get(entry.documentId) : undefined;
      return {
        ...entry,
        ...(mutation ? { mutation } : {}),
        ...(document
          ? {
              document: {
                id: document.id,
                fileName: document.fileName,
                type: document.type,
                verificationStatus: document.verificationStatus,
              },
            }
          : {}),
      };
    });
    const mutations = mutationRows.map(
      ({ requestedBy, assignedOfficer, approvedBy, rejectedBy, ...mutation }) => ({
        mutation,
        applicantName: requestedBy.name,
        responsibleOfficerName:
          approvedBy?.name ?? rejectedBy?.name ?? assignedOfficer?.name,
      }),
    );
    const profileDetails =
      parcel.owner.profileDetails &&
      typeof parcel.owner.profileDetails === "object" &&
      !Array.isArray(parcel.owner.profileDetails)
        ? parcel.owner.profileDetails
        : {};
    const address =
      "address" in profileDetails && typeof profileDetails.address === "string"
        ? profileDetails.address
        : undefined;
    const referenceId = maskNationalId(parcel.owner.nationalId);

    return {
      parcel: {
        ...toParcel(parcel, disputes.filter((dispute) =>
          !["resolved", "rejected", "withdrawn"].includes(dispute.status)).length),
        registryStatus: recordRegistryStatus(
          mutationRows as { status: MutationStatus; disputeId?: string | null }[],
          disputes.filter((dispute) =>
            !["resolved", "rejected", "withdrawn"].includes(dispute.status)).length,
          documents.some((document) => document.verificationStatus === "flagged"),
        ),
      },
      owner: {
        id: parcel.owner.id,
        name: parcel.owner.name,
        ...(referenceId ? { referenceId } : {}),
        ...(address ? { address } : {}),
      },
      jurisdiction: ancestryOf(parcel.jurisdictionId, jurisdictions as Jurisdiction[]),
      ownership,
      mutations,
      disputes,
      documents,
      restrictions,
      audit,
    };
  }

  /**
   * The unauthenticated lookup — a land registry is a public record, and this
   * is the one route that does not assume a signed-in caller.
   *
   * Declared before ":id" because Nest matches in registration order and would
   * otherwise read "public" as a parcel id.
   *
   * Looked up by ULPIN, not internal id: the identifier is the thing a member
   * of the public can be given, and internal ids are enumerable in a way a
   * public endpoint should not encourage.
   */
  @Get("public/:ulpin")
  async publicView(@Param("ulpin") ulpin: string) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { ulpin: normaliseUlpin(ulpin) },
      include: {
        owner: { select: { name: true } },
        mutations: {
          where: { status: { in: [...ACTIVE_MUTATION_STATUSES] } },
          select: { status: true, disputeId: true },
        },
        documents: {
          where: { verificationStatus: "flagged" },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!parcel) throw new NotFoundError("Parcel not found");

    const restrictions = await this.prisma.parcelRestriction.findMany({
      where: { parcelId: parcel.id },
      orderBy: { fromDate: "desc" },
    });

    // Narrowed by the rule, not by picking fields here — one tested decision
    // about what is public, rather than one per endpoint.
    const counts = await openDisputeCounts(this.prisma, [parcel.id]);
    const { mutations, documents, ...row } = parcel;
    const openDisputeCount = counts.get(parcel.id) ?? 0;
    return toPublicParcel(
      {
        ...row,
        ownerName: row.owner.name,
        registryStatus: recordRegistryStatus(
          mutations as { status: MutationStatus; disputeId?: string | null }[],
          openDisputeCount,
          documents.length > 0,
        ),
      },
      restrictions as unknown as ParcelRestriction[],
    );
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { id },
      include: { owner: { select: { name: true } } },
    });
    if (!parcel) throw new NotFoundError("Parcel not found");

    const [ownership, documents, disputes, mutations, restrictions] = await Promise.all([
      this.prisma.ownershipRecord.findMany({ where: { parcelId: id } }),
      this.prisma.landDocument.findMany({ where: { parcelId: id } }),
      this.prisma.dispute.findMany({ where: { parcelId: id } }),
      this.prisma.mutation.findMany({
        where: { parcelId: id, status: { in: [...ACTIVE_MUTATION_STATUSES] } },
        select: { status: true, disputeId: true },
      }),
      this.prisma.parcelRestriction.findMany({
        where: { parcelId: id },
        orderBy: { fromDate: "desc" },
      }),
    ]);
    const counts = await openDisputeCounts(this.prisma, [id]);

    const openDisputeCount = counts.get(id) ?? 0;
    return {
      parcel: {
        ...toParcel(parcel, openDisputeCount),
        registryStatus: recordRegistryStatus(
          mutations as { status: MutationStatus; disputeId?: string | null }[],
          openDisputeCount,
          documents.some((document) => document.verificationStatus === "flagged"),
        ),
      },
      ownership,
      documents,
      disputes,
      restrictions,
      // Derived here rather than in the browser: whether land may change hands
      // is the server's answer, and the same one that will refuse a mutation.
      transfer: transferReview(restrictions as unknown as ParcelRestriction[]),
    };
  }

  @Get(":id/history")
  async history(@Param("id") id: string) {
    return this.prisma.ownershipRecord.findMany({
      where: { parcelId: id },
      orderBy: { fromDate: "desc" },
    });
  }

  @Get(":id/neighbours")
  async neighbours(@Param("id") id: string) {
    const target = await this.prisma.parcel.findUnique({ where: { id } });
    if (!target) throw new NotFoundError("Parcel not found");

    const others = await this.prisma.parcel.findMany({
      where: { id: { not: id } },
      include: {
        owner: { select: { name: true } },
        mutations: {
          where: { status: { in: [...ACTIVE_MUTATION_STATUSES] } },
          select: { status: true, disputeId: true },
        },
        documents: {
          where: { verificationStatus: "flagged" },
          select: { id: true },
          take: 1,
        },
      },
    });
    const origin = target.centroid as GeoPoint;
    const counts = await openDisputeCounts(this.prisma, others.map((p) => p.id));

    return others
      .sort((a, b) => distance(a.centroid as GeoPoint, origin) - distance(b.centroid as GeoPoint, origin))
      .slice(0, 4)
      .map(({ mutations, documents, ...parcel }) => {
        const openDisputeCount = counts.get(parcel.id) ?? 0;
        return {
          ...toParcel(parcel, openDisputeCount),
          registryStatus: recordRegistryStatus(
            mutations as { status: MutationStatus; disputeId?: string | null }[],
            openDisputeCount,
            documents.length > 0,
          ),
        };
      });
  }

  private async landOfficeJurisdictionIds(req: Request): Promise<string[]> {
    const actor = await loadMutationActor(this.prisma, req);
    const jurisdictions = await this.prisma.jurisdiction.findMany();
    return [...coveredJurisdictionIds(actor, jurisdictions)];
  }
}

import { Controller, ForbiddenException, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  ancestryOf,
  maskNationalId,
  normaliseUlpin,
  toPublicParcel,
  transferReview,
  type Jurisdiction,
  type ParcelRestriction,
} from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { currentUserId } from "../auth/dev-current-user";
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
    const officeJurisdictionIds = req.header("x-plotguard-role") === "land-office"
      ? await this.landOfficeJurisdictionIds(req)
      : undefined;

    const where = {
      ...(officeJurisdictionIds ? { jurisdictionId: { in: officeJurisdictionIds } } : {}),
      ...(owner ? { ownerId: owner } : {}),
      ...(query.status ? { registryStatus: query.status } : {}),
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

    const [rows, total] = await Promise.all([
      this.prisma.parcel.findMany({ where, include: { owner: { select: { name: true } } } }),
      this.prisma.parcel.count({ where }),
    ]);

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
    const items = filtered.map((p) => toParcel(p, counts.get(p.id) ?? 0));

    const params = pageParams(query);
    const page = items.slice(params.skip, params.skip + params.take);
    return paginated(page, bbox ? filtered.length : total, params);
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
      parcel: toParcel(parcel, disputes.filter((dispute) =>
        !["resolved", "rejected", "withdrawn"].includes(dispute.status)).length),
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
      include: { owner: { select: { name: true } } },
    });
    if (!parcel) throw new NotFoundError("Parcel not found");

    const restrictions = await this.prisma.parcelRestriction.findMany({
      where: { parcelId: parcel.id },
      orderBy: { fromDate: "desc" },
    });

    // Narrowed by the rule, not by picking fields here — one tested decision
    // about what is public, rather than one per endpoint.
    return toPublicParcel(
      { ...parcel, ownerName: parcel.owner.name },
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

    const [ownership, documents, disputes, restrictions] = await Promise.all([
      this.prisma.ownershipRecord.findMany({ where: { parcelId: id } }),
      this.prisma.landDocument.findMany({ where: { parcelId: id } }),
      this.prisma.dispute.findMany({ where: { parcelId: id } }),
      this.prisma.parcelRestriction.findMany({
        where: { parcelId: id },
        orderBy: { fromDate: "desc" },
      }),
    ]);
    const counts = await openDisputeCounts(this.prisma, [id]);

    return {
      parcel: toParcel(parcel, counts.get(id) ?? 0),
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
      include: { owner: { select: { name: true } } },
    });
    const origin = target.centroid as GeoPoint;
    const counts = await openDisputeCounts(this.prisma, others.map((p) => p.id));

    return others
      .sort((a, b) => distance(a.centroid as GeoPoint, origin) - distance(b.centroid as GeoPoint, origin))
      .slice(0, 4)
      .map((p) => toParcel(p, counts.get(p.id) ?? 0));
  }

  private async landOfficeJurisdictionIds(req: Request): Promise<string[]> {
    const actor = await loadMutationActor(this.prisma, req);
    const jurisdictions = await this.prisma.jurisdiction.findMany();
    return [...coveredJurisdictionIds(actor, jurisdictions)];
  }
}

import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { currentUserId } from "../auth/dev-current-user";
import { NotFoundError } from "../common/domain-exceptions";
import { pageParams, paginated } from "../common/pagination";
import { type GeoPoint, distance, openDisputeCounts, toParcel } from "./parcel-view";

@Controller("parcels")
export class ParcelsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const owner = query.owner === "me" ? currentUserId(req) : query.owner;
    const dag = query.dag?.toLowerCase();
    const khatian = query.khatian?.toLowerCase();
    const q = query.q?.toLowerCase();
    const bbox = query.bbox?.split(",").map(Number);

    const where = {
      ...(owner ? { ownerId: owner } : {}),
      ...(query.status ? { registryStatus: query.status } : {}),
      ...(dag ? { dagNo: { contains: dag, mode: "insensitive" as const } } : {}),
      ...(khatian ? { khatianNo: { contains: khatian, mode: "insensitive" as const } } : {}),
      ...(q
        ? {
            OR: [
              { dagNo: { contains: q, mode: "insensitive" as const } },
              { khatianNo: { contains: q, mode: "insensitive" as const } },
              { title: { contains: q, mode: "insensitive" as const } },
              { owner: { name: { contains: q, mode: "insensitive" as const } } },
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

  @Get(":id")
  async detail(@Param("id") id: string) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { id },
      include: { owner: { select: { name: true } } },
    });
    if (!parcel) throw new NotFoundError("Parcel not found");

    const [ownership, documents, disputes] = await Promise.all([
      this.prisma.ownershipRecord.findMany({ where: { parcelId: id } }),
      this.prisma.landDocument.findMany({ where: { parcelId: id } }),
      this.prisma.dispute.findMany({ where: { parcelId: id } }),
    ]);
    const counts = await openDisputeCounts(this.prisma, [id]);

    return { parcel: toParcel(parcel, counts.get(id) ?? 0), ownership, documents, disputes };
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
}

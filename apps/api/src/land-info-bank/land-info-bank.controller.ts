import { Controller, Get, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { pageParams, paginated } from "../common/pagination";
import { openDisputeCounts, toParcel } from "../parcels/parcel-view";

/**
 * A read-only register of land the government holds a public-purpose
 * interest in: parcels with an approved Acquisition & Requisition notice.
 * No khas-land or general "government land" inventory exists anywhere in
 * this system — a deliberate scope decision made when Lease & Settlement
 * was built (see that module's doc comment) — so this shows only what the
 * system actually knows happened, not a fabricated register.
 *
 * Purely a query. Nothing here is applied for, paid, or decided, so unlike
 * every other ServiceType this doesn't touch ServiceApplication's
 * apply/pay/decide lifecycle — "info-bank-request" stays reserved and
 * unused, the same as it's been since the ServiceApplication foundation.
 */
@Controller("land-info-bank")
export class LandInfoBankController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: Record<string, string>) {
    const q = query.q?.trim().toLowerCase();

    const applications = await this.prisma.serviceApplication.findMany({
      where: { serviceType: "acquisition", status: "approved" },
      orderBy: { decidedAt: "desc" },
    });
    const parcelIds = applications
      .map((a) => a.parcelId)
      .filter((id): id is string => id != null);

    const [rows, counts] = await Promise.all([
      this.prisma.parcel.findMany({
        where: { id: { in: parcelIds } },
        include: { owner: { select: { name: true } } },
      }),
      openDisputeCounts(this.prisma, parcelIds),
    ]);
    // Join and search against the raw Prisma rows — toParcel()'s return type
    // is opaque past `owner`/`openDisputeCount`, so property access (dagNo,
    // title) has to happen before that conversion, not after.
    const rowById = new Map(rows.map((p) => [p.id, p]));

    const entries = applications
      .map((application) => ({
        application,
        row: application.parcelId ? rowById.get(application.parcelId) : undefined,
      }))
      .filter((e): e is { application: (typeof applications)[number]; row: NonNullable<typeof e.row> } =>
        Boolean(e.row),
      )
      .filter((e) => {
        if (!q) return true;
        const purpose = String((e.application.details as { purpose?: string })?.purpose ?? "");
        return (
          e.row.dagNo.toLowerCase().includes(q) ||
          e.row.title.toLowerCase().includes(q) ||
          purpose.toLowerCase().includes(q)
        );
      })
      .map((e) => ({
        application: e.application,
        parcel: toParcel(e.row, counts.get(e.row.id) ?? 0),
      }));

    const params = pageParams(query);
    return paginated(entries.slice(params.skip, params.skip + params.take), entries.length, params);
  }
}

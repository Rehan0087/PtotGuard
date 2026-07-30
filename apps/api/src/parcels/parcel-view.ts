import type { PrismaService } from "../prisma/prisma.service";

/** Mirrors CLOSED_DISPUTE_STATUSES in @plotguard/rules' assignment.ts (unexported). */
export const CLOSED_DISPUTE_STATUSES = ["resolved", "rejected", "withdrawn"];

export type GeoPoint = { lat: number; lng: number };

export function distance(a: GeoPoint, b: GeoPoint): number {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}

/** One grouped query for however many parcel ids, not one count query each. */
export async function openDisputeCounts(
  prisma: PrismaService,
  parcelIds: string[],
): Promise<Map<string, number>> {
  if (parcelIds.length === 0) return new Map();
  const groups = await prisma.dispute.groupBy({
    by: ["parcelId"],
    where: { parcelId: { in: parcelIds }, status: { notIn: CLOSED_DISPUTE_STATUSES } },
    _count: true,
  });
  return new Map(groups.map((g) => [g.parcelId, g._count]));
}

/**
 * ownerName and openDisputeCount are denormalised in the domain model
 * (packages/rules/src/types/parcel.ts) for a flat in-memory mock; here they
 * come from a real relation and a live count instead, so nothing goes stale.
 * Shared because every composite that embeds a full Parcel (dispute detail,
 * mutation detail, field-report detail, ...) needs the same two fields
 * attached the same way — one place to get it right.
 */
export function toParcel(
  row: { owner: { name: string } } & Record<string, unknown>,
  openCount: number,
) {
  const { owner, ...rest } = row;
  return { ...rest, ownerName: owner.name, openDisputeCount: openCount };
}

/** Fetch one parcel with its derived fields attached, or null. */
export async function findParcelView(prisma: PrismaService, id: string) {
  const parcel = await prisma.parcel.findUnique({
    where: { id },
    include: { owner: { select: { name: true } } },
  });
  if (!parcel) return null;
  const counts = await openDisputeCounts(prisma, [id]);
  return toParcel(parcel, counts.get(id) ?? 0);
}

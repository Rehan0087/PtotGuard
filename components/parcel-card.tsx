"use client";

import Link from "next/link";
import { MapPin, Scale, UserRound } from "lucide-react";
import type { Parcel } from "@/lib/types";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { cn } from "@/lib/utils";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { ParcelBoundary } from "@/components/parcel-boundary";
import { SurveyCorners } from "@/components/survey-corners";

export function ParcelCard({
  parcel,
  showOwner = false,
  className,
}: {
  parcel: Parcel;
  showOwner?: boolean;
  className?: string;
}) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();

  return (
    <Link
      href={`/parcels/${parcel.id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="relative h-28 border-b border-border bg-secondary/40 text-primary">
        <ParcelBoundary boundary={parcel.boundary} />
        <div className="absolute left-3 top-3">
          <IdChip icon={MapPin} className="bg-card/90 backdrop-blur">
            {parcel.dagNo}
          </IdChip>
        </div>
        <div className="absolute right-3 top-3">
          <StatusMetaBadge meta={s.registry[parcel.registryStatus]} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-heading text-sm font-semibold leading-snug text-foreground">
          {parcel.title}
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{t.domain.landUse[parcel.landUse]}</span>
          <span aria-hidden>·</span>
          <span className="tabular">{f.area(parcel.area)}</span>
          <span aria-hidden>·</span>
          <span>{t.domain.ownershipType[parcel.ownershipType]}</span>
        </div>

        <div className="mt-auto flex items-center justify-between pt-1 text-xs">
          {showOwner ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <UserRound className="size-3.5" />
              {parcel.ownerName}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t.components.parcelCard.registeredIn(
                new Date(parcel.registeredAt).getFullYear(),
              )}
            </span>
          )}
          {parcel.openDisputeCount > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-disputed">
              <Scale className="size-3.5" />
              {t.components.parcelCard.openDisputes(parcel.openDisputeCount)}
            </span>
          ) : null}
        </div>
      </div>

      <SurveyCorners className="opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

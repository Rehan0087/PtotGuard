"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ParcelCard } from "@/components/parcel-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useParcels } from "@/hooks/queries";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * ILRDMS "My land" — the plots recorded in the signed-in citizen's name.
 *
 * Deliberately a list and nothing more: the title chain, documents, and
 * disputes for a plot already live on its detail screen, and duplicating any
 * of that here would be a second place to keep correct.
 */
export default function PropertiesPage() {
  const t = useT();
  // Scoped server-side by `owner=me`, not filtered in the browser — the list
  // of who owns what is not something to fetch broadly and narrow on arrival.
  const { data, isLoading } = useParcels({ owner: "me", pageSize: 100 });
  const parcels = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.myProperties}
        description={t.pages.properties.description}
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : parcels.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={t.pages.properties.emptyTitle}
          description={t.pages.properties.emptyBody}
        >
          <Link href="/search" className={cn(buttonVariants({ size: "sm" }))}>
            {t.pages.properties.searchRecords}
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="tabular text-sm text-muted-foreground">
              {t.pages.properties.count(parcels.length)}
            </p>
            <p className="text-xs text-muted-foreground">{t.pages.properties.note}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {parcels.map((parcel) => (
              // showOwner stays off: every plot here is the reader's own, so
              // repeating their name on each card says nothing.
              <ParcelCard key={parcel.id} parcel={parcel} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

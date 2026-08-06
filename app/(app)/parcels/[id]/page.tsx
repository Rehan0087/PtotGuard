"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Fingerprint,
  Lock,
  MapPin,
  Ruler,
  Landmark,
  CalendarDays,
  History,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { ParcelBoundary } from "@/components/parcel-boundary";
import { SurveyCorners } from "@/components/survey-corners";
import { DisputeListItem } from "@/components/dispute-list-item";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useParcel, useParcelNeighbours } from "@/hooks/queries";
import { formatCoord } from "@/lib/format";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { cn } from "@/lib/utils";

// Leaflet reads `window` on evaluation, so the map never renders on the server.
const ParcelLiveMap = dynamic(
  () => import("@/components/parcel-live-map").then((m) => m.ParcelLiveMap),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full rounded-lg" /> },
);

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-marker" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium text-foreground">{children}</div>
      </div>
    </div>
  );
}

export default function ParcelDetailPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useParcel(id);
  const { data: neighbours } = useParcelNeighbours(id);

  // This plot first so it wins the focus styling, then whatever is nearby.
  // Memoised because a fresh array each render would restart the map effect.
  const mapParcels = useMemo(
    () => (data ? [data.parcel, ...(neighbours ?? [])] : []),
    [data, neighbours],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={MapPin}
        title={t.pages.parcel.notFoundTitle}
        description={t.pages.parcel.notFoundBody}
      >
        <Link href="/search" className="text-sm text-primary hover:underline">
          {t.pages.parcel.backToSearch}
        </Link>
      </EmptyState>
    );
  }

  const { parcel, ownership, documents, disputes, restrictions, transfer } = data;
  const activeIds = new Set([...transfer.blockers, ...transfer.consents].map((r) => r.id));

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.common.back}
      </Link>

      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-1.5">
            <IdChip icon={MapPin}>{parcel.dagNo}</IdChip>
            <IdChip>{t.pages.parcel.khatian(parcel.khatianNo)}</IdChip>
            {/* The one identifier a citizen can quote on its own — leading, not
                buried in the fact grid. Absent on records whose jurisdiction
                chain can't produce one, so it is rendered conditionally. */}
            {parcel.ulpin ? (
              <IdChip icon={Fingerprint} title={t.pages.parcel.ulpinTitle}>
                {parcel.ulpin}
              </IdChip>
            ) : null}
          </span>
        }
        title={parcel.title}
        description={t.pages.parcel.subtitle(
          t.domain.landUse[parcel.landUse],
          t.domain.ownershipType[parcel.ownershipType],
        )}
      >
        <StatusMetaBadge meta={s.registry[parcel.registryStatus]} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="relative gap-0 overflow-hidden p-0">
            <div className="relative h-56 border-b border-border bg-secondary/40 text-primary">
              <ParcelBoundary boundary={parcel.boundary} />
            </div>
            {/* Where it is, not just what shape it is — the thumbnail above
                carries the shape, this carries the location. */}
            <div className="space-y-2 border-b border-border p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium text-foreground">{t.pages.parcel.mapTitle}</h2>
                <p className="text-xs text-muted-foreground">{t.pages.parcel.mapHint}</p>
              </div>
              <ParcelLiveMap parcels={mapParcels} focusId={parcel.id} />
              <p className="text-xs text-muted-foreground">{t.pages.parcel.mapApproximate}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
              <Fact icon={Ruler} label={t.pages.parcel.area}>
                <span className="tabular">{f.area(parcel.area)}</span>
              </Fact>
              <Fact icon={Landmark} label={t.pages.parcel.marketValue}>
                {parcel.marketValue ? f.money(parcel.marketValue) : t.common.notAvailable}
              </Fact>
              <Fact icon={CalendarDays} label={t.pages.parcel.registered}>
                {f.date(parcel.registeredAt)}
              </Fact>
              <Fact icon={MapPin} label={t.pages.parcel.centroid}>
                {/* Latin in both locales — a coordinate gets copied into other tools. */}
                <span className="tabular text-xs">
                  {formatCoord(parcel.centroid.lat, parcel.centroid.lng)}
                </span>
              </Fact>
              <Fact icon={Landmark} label={t.pages.parcel.owner}>
                {parcel.ownerName}
              </Fact>
            </div>
            <SurveyCorners />
          </Card>

          {/* What limits what may be done with this land. Sits above the title
              chain because it governs the present, not the past. */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-heading text-base font-semibold text-foreground">
              <Lock className="size-4 text-marker" />
              {t.pages.parcel.restrictions}
            </h2>
            <Card className="gap-3 px-4">
              {restrictions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t.pages.parcel.restrictionsNone}
                </p>
              ) : (
                <>
                  {/* The transfer verdict comes from the server, not from
                      counting rows here — same answer that will refuse a
                      mutation. */}
                  {transfer.blockers.length > 0 ? (
                    <p className="rounded-md bg-flagged/10 px-3 py-2 text-sm text-flagged">
                      {t.pages.parcel.transferBlocked}
                    </p>
                  ) : transfer.consents.length > 0 ? (
                    <p className="rounded-md bg-pending/10 px-3 py-2 text-sm text-pending">
                      {t.pages.parcel.transferConsent}
                    </p>
                  ) : null}

                  <ul className="divide-y divide-border">
                    {restrictions.map((r) => {
                      const active = activeIds.has(r.id);
                      return (
                        <li
                          key={r.id}
                          className={cn("py-2.5 first:pt-0 last:pb-0", !active && "opacity-55")}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {t.domain.restrictionType[r.type]}
                            </span>
                            {r.referenceNo ? <IdChip>{r.referenceNo}</IdChip> : null}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {r.authority} ·{" "}
                            {r.toDate
                              ? t.pages.parcel.restrictionLifted(f.date(r.toDate))
                              : t.pages.parcel.restrictionSince(f.date(r.fromDate))}
                          </div>
                          {/* Record content — shown as filed, never translated. */}
                          {r.note ? (
                            <p className="mt-1 text-xs text-foreground">{r.note}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Card>
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 font-heading text-base font-semibold text-foreground">
              <History className="size-4 text-marker" />
              {t.pages.parcel.chainOfTitle}
            </h2>
            <Card className="gap-0 px-0 py-1">
              <ol className="divide-y divide-border">
                {ownership.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{o.ownerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.domain.acquisitionType[o.acquisitionType]} · {f.date(o.fromDate)} –{" "}
                        {o.toDate ? f.date(o.toDate) : t.pages.parcel.present}
                      </div>
                    </div>
                    {o.toDate === null ? (
                      <StatusMetaBadge
                        meta={{ tone: "verified", label: t.pages.parcel.current }}
                      />
                    ) : null}
                  </li>
                ))}
                {ownership.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t.pages.parcel.noOwnershipHistory}
                  </li>
                ) : null}
              </ol>
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 font-heading text-base font-semibold text-foreground">
              {t.pages.parcel.documents}
            </h2>
            <div className="space-y-2">
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.pages.parcel.noDocuments}</p>
              ) : (
                documents.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                      <FileText className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {d.fileName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.domain.documentType[d.type]}
                      </div>
                    </div>
                    <StatusMetaBadge meta={s.verification[d.verificationStatus]} dot={false} />
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-heading text-base font-semibold text-foreground">
              {t.pages.parcel.disputes}
            </h2>
            <div className="space-y-2">
              {disputes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.pages.parcel.noDisputes}</p>
              ) : (
                disputes.map((d) => <DisputeListItem key={d.id} dispute={d} />)
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, SearchX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { useServiceApplicationEventTitle } from "@/lib/i18n/content";
import { useServiceApplication } from "@/hooks/queries";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Tracking for every service on the ServiceApplication model — land tax,
 * land administration, revenue cases, lease & settlement, acquisition,
 * information-bank requests and appointments all share one lifecycle, so
 * they share one screen rather than seven near-identical ones.
 *
 * The service's own page already shows its bespoke fields; what only the
 * server knows is the order things happened in, which is what this is for.
 */
export default function ApplicationTrackingPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const a = t.pages.application;
  const eventTitle = useServiceApplicationEventTitle();
  const { data, isLoading } = useServiceApplication(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={SearchX} title={a.notFoundTitle} description={a.notFoundBody} />;
  }

  const { application, timeline, parcel } = data;
  const methods = a.methods as Record<string, string | undefined>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {a.back}
        </Link>

        <PageHeader
          eyebrow={t.domain.serviceType[application.serviceType]}
          title={application.applicationNo}
          description={a.description}
        >
          <StatusMetaBadge meta={s.serviceApplication[application.status]} />
        </PageHeader>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-4 font-heading text-base font-semibold text-foreground">
            {a.timeline}
          </h2>
          <ol className="relative border-l border-border pl-6">
            {timeline.map((e, i) => (
              <li key={e.id} className="relative pb-6 last:pb-0">
                <span
                  className={`absolute -left-[1.6rem] top-0.5 flex size-3 items-center justify-center rounded-full ring-4 ring-background ${
                    i === timeline.length - 1 ? "bg-marker" : "bg-primary"
                  }`}
                  aria-hidden
                />
                <div className="text-sm font-medium text-foreground">{eventTitle(e)}</div>
                {/* The stored title carries the specific thing that happened;
                    the localised headline above it is deliberately generic. */}
                {e.title && e.title !== eventTitle(e) ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{e.title}</p>
                ) : null}
                {e.description ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{e.description}</p>
                ) : null}
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{f.dateTime(e.at)}</span>
                  {e.actorName ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{e.actorName}</span>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
            {timeline.length === 0 ? (
              <li className="text-sm text-muted-foreground">{a.noEvents}</li>
            ) : null}
          </ol>
        </div>

        <div className="space-y-6">
          <Card className="gap-3 px-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">{a.details}</h3>
            <dl className="grid gap-2.5 text-sm">
              <Row label={a.service}>{t.domain.serviceType[application.serviceType]}</Row>

              {application.feeAmount != null ? (
                <Row label={a.fee}>
                  <span className="tabular">
                    {f.money({ amount: application.feeAmount, currency: "BDT" })}
                  </span>
                </Row>
              ) : null}

              {application.paidAt ? (
                <Row label={a.paidOn}>{f.date(application.paidAt)}</Row>
              ) : application.feeAmount != null ? (
                <Row label={a.paidOn}>
                  <span className="text-muted-foreground">{a.unpaid}</span>
                </Row>
              ) : null}

              {application.paymentMethod ? (
                <Row label={a.method}>
                  {methods[application.paymentMethod] ?? application.paymentMethod}
                </Row>
              ) : null}

              {application.transactionId ? (
                <Row label={a.transaction}>
                  <span className="tabular">{application.transactionId}</span>
                </Row>
              ) : null}

              {application.submittedAt ? (
                <Row label={a.submittedOn}>{f.date(application.submittedAt)}</Row>
              ) : null}

              {application.decidedAt ? (
                <Row label={a.decidedOn}>{f.date(application.decidedAt)}</Row>
              ) : null}
            </dl>

            {parcel ? (
              <Link
                href={`/parcels/${parcel.id}`}
                className="flex items-center gap-2 border-t border-border pt-3 text-sm text-primary hover:underline"
              >
                <MapPin className="size-4 shrink-0" />
                <IdChip>{parcel.dagNo}</IdChip>
                <span className="truncate">{parcel.title}</span>
              </Link>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

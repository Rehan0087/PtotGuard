"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, FileText, Scale, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDispute } from "@/hooks/queries";
import { useDisputeEventTitle } from "@/lib/i18n/content";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";

export default function DisputeDetailPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const eventTitle = useDisputeEventTitle();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useDispute(id);

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
        icon={Scale}
        title={t.pages.dispute.notFoundTitle}
        description={t.pages.dispute.notFoundBody}
      >
        <Link href="/disputes" className="text-sm text-primary hover:underline">
          {t.pages.dispute.backToDisputes}
        </Link>
      </EmptyState>
    );
  }

  const { dispute, timeline, parcel, evidence } = data;

  return (
    <div className="space-y-6">
      <Link
        href="/disputes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.pages.dispute.backToDisputes}
      </Link>

      <PageHeader
        eyebrow={<IdChip icon={Scale}>{dispute.caseNumber}</IdChip>}
        title={t.pages.dispute.heading(t.domain.disputeType[dispute.type])}
        description={dispute.description}
      >
        <StatusMetaBadge meta={s.dispute[dispute.status]} />
        <StatusMetaBadge meta={s.priority[dispute.priority]} dot={false} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-4 font-heading text-base font-semibold text-foreground">
            {t.pages.dispute.timeline}
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
              <li className="text-sm text-muted-foreground">{t.pages.dispute.noEvents}</li>
            ) : null}
          </ol>
        </div>

        <div className="space-y-6">
          <Card className="gap-3 px-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              {t.pages.dispute.details}
            </h3>
            <dl className="grid gap-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t.pages.dispute.filedBy}</dt>
                <dd className="text-right font-medium text-foreground">{dispute.filedByName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t.pages.dispute.filed}</dt>
                <dd className="text-right text-foreground">{f.date(dispute.filedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t.pages.dispute.lastUpdate}</dt>
                <dd className="text-right text-foreground">{f.fromNow(dispute.updatedAt)}</dd>
              </div>
              {dispute.hearingDate ? (
                <div className="flex justify-between gap-3">
                  <dt className="inline-flex items-center gap-1 text-muted-foreground">
                    <CalendarClock className="size-3.5" /> {t.pages.dispute.hearing}
                  </dt>
                  <dd className="text-right font-medium text-marker">
                    {f.date(dispute.hearingDate)}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="border-t border-border pt-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {t.pages.dispute.parties}
              </div>
              <ul className="space-y-1.5">
                {dispute.parties.map((p, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.domain.partyRole[p.role]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {parcel ? (
              <Link
                href={`/parcels/${parcel.id}`}
                className="flex items-center gap-2 border-t border-border pt-3 text-sm text-primary hover:underline"
              >
                <MapPin className="size-4" />
                {t.components.disputeListItem.dag(parcel.dagNo)} · {parcel.title}
              </Link>
            ) : null}
          </Card>

          {evidence.length > 0 ? (
            <section>
              <h3 className="mb-2 font-heading text-sm font-semibold text-foreground">
                {t.pages.dispute.evidence}
              </h3>
              <div className="space-y-2">
                {evidence.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <FileText className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {d.fileName}
                    </span>
                    <StatusMetaBadge meta={s.verification[d.verificationStatus]} dot={false} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Gavel, CalendarClock, Users, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHearings } from "@/hooks/queries";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";

export default function CasesPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const { data, isLoading } = useHearings({ mediator: "me" });
  const cases = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.mediation}
        title={t.nav.cases}
        description={t.pages.cases.description}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title={t.pages.cases.emptyTitle}
          description={t.pages.cases.emptyBody}
        />
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <Card key={c.id} className="gap-3 px-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IdChip icon={Gavel}>{c.caseNumber}</IdChip>
                  <span className="text-sm text-muted-foreground">
                    {t.components.disputeListItem.dag(c.parcelDagNo)}
                  </span>
                </div>
                <StatusMetaBadge meta={s.hearing[c.status]} />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  {c.parties.join(t.pages.cases.partySeparator)}
                </span>
                {c.hearingDate ? (
                  <span className="inline-flex items-center gap-1.5 text-marker">
                    <CalendarClock className="size-3.5" />
                    {t.pages.cases.hearingAt(f.dateTime(c.hearingDate))}
                  </span>
                ) : null}
                <span>{t.pages.cases.sessions(c.sessions.length)}</span>
              </div>

              {c.ruling ? (
                <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-secondary-foreground">
                  <span className="font-medium">{t.pages.cases.ruling} · </span>
                  {c.ruling}
                </p>
              ) : null}

              <Link
                href={`/disputes/${c.disputeId}`}
                className="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline"
              >
                {t.pages.cases.viewDispute} <ArrowRight className="size-3.5" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

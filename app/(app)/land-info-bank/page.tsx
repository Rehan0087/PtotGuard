"use client";

import { useState } from "react";
import Link from "next/link";
import { Landmark, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLandInfoBank, type LandInfoBankEntry } from "@/hooks/queries";

function EntryCard({ entry }: { entry: LandInfoBankEntry }) {
  const t = useT();
  const f = useFmt();
  const details = entry.application.details as { purpose?: string; awardAmount?: number };

  return (
    <Link href={`/parcels/${entry.parcel.id}`} className="block h-full focus-visible:outline-none">
      <Card className="h-full gap-3 px-5 py-4 ring-1 ring-transparent transition-colors hover:bg-accent/40 hover:ring-border">
        <div className="flex flex-wrap items-center gap-2">
          <IdChip>{entry.parcel.dagNo}</IdChip>
          <span className="truncate text-sm text-muted-foreground">{entry.parcel.title}</span>
        </div>

        {details.purpose ? (
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground">{t.pages.landInfoBank.purposeLabel}</span>
            <p className="text-pretty text-sm text-foreground">{details.purpose}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          {details.awardAmount != null ? (
            <span className="tabular">
              {t.pages.landInfoBank.awardLabel}:{" "}
              <span className="font-medium text-foreground">
                {f.money({ amount: details.awardAmount, currency: "BDT" })}
              </span>
            </span>
          ) : null}
          {entry.application.decidedAt ? (
            <span>{t.pages.landInfoBank.decidedLabel(f.date(entry.application.decidedAt))}</span>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

export default function LandInfoBankPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const hasQuery = debouncedQ.trim().length > 0;
  const { data, isLoading } = useLandInfoBank({ q: debouncedQ, pageSize: 50 });
  const entries = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.infoBank}
        description={t.pages.landInfoBank.description}
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.pages.landInfoBank.searchPlaceholder}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={hasQuery ? SearchX : Landmark}
          title={hasQuery ? t.pages.landInfoBank.noResultsTitle : t.pages.landInfoBank.emptyTitle}
          description={hasQuery ? t.pages.landInfoBank.noResultsBody : t.pages.landInfoBank.emptyBody}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t.pages.landInfoBank.resultCount(data?.total ?? entries.length)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {entries.map((entry) => (
              <EntryCard key={entry.application.id} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

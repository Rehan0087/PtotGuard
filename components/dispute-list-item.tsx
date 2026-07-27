"use client";

import Link from "next/link";
import { Scale, ChevronRight } from "lucide-react";
import type { Dispute } from "@/lib/types";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { StatusMetaBadge } from "./status-badge";
import { IdChip } from "./id-chip";

export function DisputeListItem({ dispute }: { dispute: Dispute }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();

  return (
    <Link
      href={`/disputes/${dispute.id}`}
      className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
        <Scale className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <IdChip>{dispute.caseNumber}</IdChip>
          <span className="text-xs text-muted-foreground">
            {t.domain.disputeType[dispute.type]} ·{" "}
            {t.components.disputeListItem.dag(dispute.parcelDagNo)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <StatusMetaBadge meta={s.dispute[dispute.status]} />
          <span className="text-xs text-muted-foreground">
            {t.components.disputeListItem.updated(f.fromNow(dispute.updatedAt))}
          </span>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

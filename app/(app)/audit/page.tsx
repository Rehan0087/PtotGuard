"use client";

import { ShieldCheck, ShieldAlert, Link2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { IdChip } from "@/components/id-chip";
import { cn } from "@/lib/utils";
import { sentenceCase } from "@/lib/format";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useAuditLedger, useVerifyAudit } from "@/hooks/queries";
import type { AuditAction, StatusTone } from "@/lib/types";

const ACTION_TONE: Record<string, StatusTone> = {
  create: "review",
  upload: "review",
  update: "review",
  approve: "verified",
  ruling: "verified",
  reject: "flagged",
  "status-change": "pending",
  assign: "pending",
};

export default function AuditPage() {
  const t = useT();
  const f = useFmt();
  const { data: events = [], isLoading } = useAuditLedger();

  /** `action` is open-ended, so an unrecognised verb falls back to its raw form. */
  const actionLabel = (action: string) =>
    t.domain.auditAction[action as AuditAction] ?? sentenceCase(action);
  const verify = useVerifyAudit();
  const result = verify.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.administration}
        title={t.nav.auditLedger}
        description={t.pages.audit.description}
      >
        <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
          {verify.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {t.pages.audit.verify}
        </Button>
      </PageHeader>

      {result ? (
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3",
            result.ok
              ? "border-verified/30 bg-verified-soft text-verified"
              : "border-flagged/30 bg-flagged-soft text-flagged",
          )}
        >
          {result.ok ? <ShieldCheck className="size-5 shrink-0" /> : <ShieldAlert className="size-5 shrink-0" />}
          <div>
            <div className="text-sm font-semibold">
              {result.ok ? t.pages.audit.chainIntact : t.pages.audit.chainBroken}
            </div>
            <div className="text-xs opacity-90">
              {result.ok
                ? t.pages.audit.verifiedCount(result.checkedCount)
                : t.pages.audit.brokenAt((result.brokenAt?.index ?? 0) + 1)}
            </div>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <ol>
          {events.map((e, i) => (
            <li key={e.id} className="relative pl-8">
              {i < events.length - 1 ? (
                <span className="absolute bottom-0 left-3 top-4 w-px bg-border" aria-hidden />
              ) : null}
              <span
                className="absolute left-[0.4rem] top-4 size-3 rounded-full bg-marker ring-4 ring-background"
                aria-hidden
              />
              <Card className="mb-3 gap-2 px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      tone={ACTION_TONE[e.action] ?? "neutral"}
                      label={actionLabel(e.action)}
                      dot={false}
                    />
                    <IdChip>
                      {e.entityType}/{e.entityId}
                    </IdChip>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {f.dateTime(e.createdAt)} · {e.actorName}
                  </span>
                </div>

                {Object.keys(e.payload).length > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {Object.entries(e.payload)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join("  ·  ")}
                  </div>
                ) : null}

                <div className="tabular flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="size-3.5 shrink-0 text-marker" />
                  {/* Hashes stay Latin: they are compared and copied, not read. */}
                  <span title={e.prevHash || t.pages.audit.genesisTitle}>
                    {t.pages.audit.prevLabel}&nbsp;
                    {e.prevHash ? `${e.prevHash.slice(0, 10)}…` : t.pages.audit.prevGenesis}
                  </span>
                  <span aria-hidden>→</span>
                  <span title={e.hash} className="text-foreground/80">
                    {t.pages.audit.hashLabel}&nbsp;{e.hash.slice(0, 10)}…
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

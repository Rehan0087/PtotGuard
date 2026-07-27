"use client";

import { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  FileText,
  MapPin,
  ScanLine,
  Ban,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import {
  useDocuments,
  useParcels,
  useDocumentDecision,
  useReprocessDocument,
} from "@/hooks/queries";
import type { LandDocument } from "@/lib/types";

/** 0..1 fraud score → risk band + bar treatment. The words come from `t`. */
function scoreBand(score: number) {
  if (score >= 0.7) return { risk: "high", bar: "bg-flagged", text: "text-flagged" } as const;
  if (score >= 0.4) return { risk: "suspicious", bar: "bg-pending", text: "text-pending" } as const;
  return { risk: "low", bar: "bg-verified", text: "text-verified" } as const;
}

function FraudCard({
  doc,
  dagNo,
  onDecide,
  onReprocess,
  pendingId,
}: {
  doc: LandDocument;
  dagNo?: string;
  onDecide: (id: string, decision: "verify" | "reject") => void;
  onReprocess: (id: string) => void;
  pendingId: string | null;
}) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const score = doc.fraudScore;
  const band = score === undefined ? null : scoreBand(score);
  const busy = pendingId === doc.id;

  return (
    <Card className="gap-4 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-flagged-soft text-flagged">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{doc.fileName}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{t.domain.documentType[doc.type]}</span>
              <span aria-hidden>·</span>
              <span className="tabular">{f.fileSize(doc.sizeBytes)}</span>
              {doc.pageCount ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{t.pages.documents.pages(doc.pageCount)}</span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <span>{t.pages.fraudReview.uploaded(f.date(doc.uploadedAt))}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dagNo ? <IdChip icon={MapPin}>{dagNo}</IdChip> : null}
          <StatusMetaBadge meta={s.ocr[doc.ocrStatus]} dot={false} />
        </div>
      </div>

      {/* Fraud score meter. A document escalated by an officer carries no model
          score — say so rather than drawing an empty bar that reads "low risk". */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium uppercase tracking-wide text-muted-foreground">
            {t.pages.fraudReview.fraudScore}
          </span>
          {band && score !== undefined ? (
            <span className={cn("font-heading text-sm font-semibold tabular-nums", band.text)}>
              {t.pages.fraudReview.scoreLine(
                f.percent(score),
                t.pages.fraudReview.risk[band.risk],
              )}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t.pages.fraudReview.notScored}</span>
          )}
        </div>
        {band && score !== undefined ? (
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full transition-all", band.bar)}
              style={{ width: `${Math.round(score * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* AI-extracted findings */}
      {doc.extractedFields && Object.keys(doc.extractedFields).length > 0 ? (
        <dl className="grid gap-1.5 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
          {Object.entries(doc.extractedFields).map(([k, v]) => {
            const suspicious = /mismatch|forgery|invalid|tamper/i.test(v);
            return (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t.fields[k] ?? k}</dt>
                <dd className={cn("text-right font-medium", suspicious ? "text-flagged" : "text-foreground")}>
                  {v}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" disabled={busy} onClick={() => onDecide(doc.id, "verify")}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
          {t.pages.fraudReview.clear}
        </Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => onDecide(doc.id, "reject")}>
          <Ban className="size-3.5" />
          {t.pages.fraudReview.reject}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onReprocess(doc.id)}
          className="ml-auto text-muted-foreground"
        >
          <ScanLine className="size-3.5" />
          {t.pages.fraudReview.rerun}
        </Button>
      </div>
    </Card>
  );
}

export default function FraudReviewPage() {
  const t = useT();
  const { data, isLoading } = useDocuments({ fraud: true });
  const { data: parcelsData } = useParcels({ pageSize: 100 });
  const decide = useDocumentDecision();
  const reprocess = useReprocessDocument();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const docs = data?.items ?? [];
  const dagByParcelId = new Map((parcelsData?.items ?? []).map((p) => [p.id, p.dagNo]));

  function onDecide(id: string, decision: "verify" | "reject") {
    setPendingId(id);
    decide.mutate(
      { id, decision },
      {
        onSuccess: (doc) => {
          toast.success(
            decision === "verify"
              ? t.pages.fraudReview.clearedTitle
              : t.pages.fraudReview.rejectedTitle,
            {
              description:
                decision === "verify"
                  ? t.pages.fraudReview.clearedBody(doc.fileName)
                  : t.pages.fraudReview.rejectedBody(doc.fileName),
            },
          );
        },
        onError: () =>
          toast.error(t.pages.fraudReview.failedTitle, {
            description: t.pages.fraudReview.failedBody,
          }),
        onSettled: () => setPendingId(null),
      },
    );
  }

  function onReprocess(id: string) {
    setPendingId(id);
    reprocess.mutate(id, {
      onSuccess: (doc) =>
        toast.info(t.pages.fraudReview.requeuedTitle, {
          description: t.pages.fraudReview.requeuedBody(doc.fileName),
        }),
      onError: () =>
        toast.error(t.pages.fraudReview.requeueFailedTitle, {
          description: t.pages.fraudReview.failedBody,
        }),
      onSettled: () => setPendingId(null),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.fraudReview}
        description={t.pages.fraudReview.description}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={t.pages.fraudReview.emptyTitle}
          description={t.pages.fraudReview.emptyBody}
        />
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <FraudCard
              key={d.id}
              doc={d}
              dagNo={d.parcelId ? dagByParcelId.get(d.parcelId) : undefined}
              onDecide={onDecide}
              onReprocess={onReprocess}
              pendingId={pendingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

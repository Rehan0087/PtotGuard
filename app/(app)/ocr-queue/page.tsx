"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  Clock,
  FileSearch,
  FileText,
  Inbox,
  Loader2,
  MapPin,
  RotateCw,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDocuments,
  useParcels,
  useDocumentDecision,
  useReprocessDocument,
  useSaveExtractedFields,
} from "@/hooks/queries";
import { extractionReview, REQUIRED_FIELDS, type ExtractionHold } from "@plotguard/rules";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { LandDocument, Parcel } from "@/lib/types";

// --- Pipeline stages -------------------------------------------------------

/** Order and icon per stage; labels and hints come from `t.pages.ocrQueue.stages`. */
const STAGES = [
  { key: "ready", icon: FileSearch },
  { key: "failed", icon: AlertTriangle },
  { key: "processing", icon: ScanLine },
  { key: "pending", icon: Clock },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

/** The gate states its reason as a code; the wording is the screen's job. */
function holdText(hold: ExtractionHold, t: Dictionary): string {
  const c = t.pages.ocrQueue.hold;
  switch (hold.code) {
    case "in-flight":
      return c.inFlight;
    case "failed":
      return c.failed;
    case "mismatch":
      return c.mismatch(
        hold.fields.map((f) => t.fields[f] ?? f).join(t.pages.ocrQueue.fieldJoiner),
      );
    case "missing":
      return c.missing(hold.count);
  }
}

/**
 * Where a document sits in the digitisation pipeline. Returns null once it has
 * left the queue — an extraction an officer has already accepted, rejected, or
 * escalated is somebody else's work now.
 */
function stageOf(doc: LandDocument): StageKey | null {
  if (doc.ocrStatus === "pending") return "pending";
  if (doc.ocrStatus === "processing") return "processing";
  if (doc.ocrStatus === "failed") return "failed";
  return doc.verificationStatus === "unverified" ? "ready" : null;
}

function StageTile({
  stage,
  count,
  active,
  onSelect,
}: {
  stage: (typeof STAGES)[number];
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const f = useFmt();
  const Icon = stage.icon;
  const { label, hint } = t.pages.ocrQueue.stages[stage.key];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      // The count and label are separate elements, so spell the tile out for
      // anyone who only hears the button.
      aria-label={t.pages.ocrQueue.stageTileAria(label, count)}
      className={cn(
        "rounded-xl bg-card px-4 py-3 text-left ring-1 transition-colors",
        active
          ? "ring-2 ring-marker"
          : "ring-foreground/10 hover:bg-muted/40",
        count === 0 && !active && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon
          className={cn(
            "size-4 shrink-0",
            stage.key === "failed" && count > 0 ? "text-flagged" : "text-muted-foreground",
            stage.key === "processing" && count > 0 && "animate-pulse text-pending",
          )}
        />
      </div>
      <div className="mt-1 font-heading text-2xl font-semibold leading-none tabular-nums text-foreground">
        {f.number(count)}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

// --- Document card ---------------------------------------------------------

function ExtractionCard({ doc, parcel }: { doc: LandDocument; parcel?: Parcel }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const [keyed, setKeyed] = useState<Record<string, string>>({});
  const saveFields = useSaveExtractedFields();
  const decide = useDocumentDecision();
  const reprocess = useReprocessDocument();

  const review = extractionReview(doc, parcel, keyed);
  const busy = saveFields.isPending || decide.isPending || reprocess.isPending;

  const required = REQUIRED_FIELDS[doc.type] ?? [];
  const read = doc.extractedFields ?? {};
  const mismatched = new Set(
    review.issues.filter((i) => i.kind === "mismatch").map((i) => i.field),
  );
  // Everything the reader found beyond what this document type has to yield.
  const extras = Object.entries(read).filter(([k]) => !required.includes(k));

  async function accept() {
    const additions = Object.fromEntries(
      Object.entries(keyed)
        .map(([k, v]) => [k, v.trim()] as const)
        .filter(([, v]) => v),
    );
    try {
      if (Object.keys(additions).length > 0) {
        await saveFields.mutateAsync({ id: doc.id, fields: additions });
      }
      await decide.mutateAsync({ id: doc.id, decision: "verify" });
      toast.success(t.pages.ocrQueue.acceptedTitle, {
        description: t.pages.ocrQueue.acceptedBody(
          doc.fileName,
          parcel?.dagNo ?? t.pages.ocrQueue.theRegister,
        ),
      });
    } catch {
      toast.error(t.pages.ocrQueue.acceptFailedTitle, {
        description: t.pages.ocrQueue.tryAgain,
      });
    }
  }

  function escalate() {
    decide.mutate(
      { id: doc.id, decision: "flag" },
      {
        onSuccess: () =>
          toast.info(t.pages.ocrQueue.escalatedTitle, {
            description: t.pages.ocrQueue.escalatedBody(doc.fileName),
          }),
        onError: () =>
          toast.error(t.pages.ocrQueue.escalateFailedTitle, {
            description: t.pages.ocrQueue.tryAgain,
          }),
      },
    );
  }

  function reject() {
    decide.mutate(
      { id: doc.id, decision: "reject" },
      {
        onSuccess: () =>
          toast.success(t.pages.ocrQueue.returnedTitle, {
            description: t.pages.ocrQueue.returnedBody(doc.fileName),
          }),
        onError: () =>
          toast.error(t.pages.ocrQueue.rejectFailedTitle, {
            description: t.pages.ocrQueue.tryAgain,
          }),
      },
    );
  }

  function retry() {
    reprocess.mutate(doc.id, {
      onSuccess: () =>
        toast.info(t.pages.ocrQueue.requeuedTitle, {
          description: t.pages.ocrQueue.requeuedBody(doc.fileName),
        }),
      onError: () =>
        toast.error(t.pages.ocrQueue.requeueFailedTitle, {
          description: t.pages.ocrQueue.tryAgain,
        }),
    });
  }

  return (
    <Card className="gap-4 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-md",
              review.stage === "failed"
                ? "bg-flagged-soft text-flagged"
                : review.stage === "in-flight"
                  ? "bg-pending-soft text-pending"
                  : "bg-secondary text-primary",
            )}
          >
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
              <span>{t.pages.ocrQueue.uploaded(f.date(doc.uploadedAt))}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {parcel ? <IdChip icon={MapPin}>{parcel.dagNo}</IdChip> : null}
          <StatusMetaBadge meta={s.ocr[doc.ocrStatus]} dot={false} />
        </div>
      </div>

      {review.stage === "in-flight" ? (
        <div className="flex items-center gap-2.5 rounded-lg bg-pending-soft px-3 py-2 text-sm text-pending">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          {doc.ocrStatus === "pending"
            ? t.pages.ocrQueue.queuedNotice
            : t.pages.ocrQueue.readingNotice}
        </div>
      ) : null}

      {review.stage === "failed" ? (
        <div className="flex items-start gap-2.5 rounded-lg bg-flagged-soft px-3 py-2 text-sm text-flagged">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="text-pretty">
            {review.hold ? holdText(review.hold, t) : null}
          </span>
        </div>
      ) : null}

      {review.stage === "ready" ? (
        <>
          {/* The digitisation station: what the reader got, and what a human
              still has to key in from the paper. */}
          <div className="space-y-2.5 rounded-lg bg-muted/50 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t.pages.ocrQueue.requiredFields}
              </span>
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  review.fieldsFound === review.fieldsRequired
                    ? "text-verified"
                    : "text-muted-foreground",
                )}
              >
                {t.pages.ocrQueue.captured(review.fieldsFound, review.fieldsRequired)}
              </span>
            </div>

            {required.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t.pages.ocrQueue.noRegisterFields}
              </p>
            ) : (
              <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {required.map((field) => {
                  const value = read[field];
                  if (value) {
                    return (
                      <div
                        key={field}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {t.fields[field] ?? field}
                        </span>
                        <span
                          className={cn(
                            "text-right font-medium",
                            mismatched.has(field) ? "text-flagged" : "text-foreground",
                          )}
                        >
                          {value}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <label key={field} className="flex items-center justify-between gap-3">
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {t.fields[field] ?? field}
                      </span>
                      <Input
                        value={keyed[field] ?? ""}
                        onChange={(e) =>
                          setKeyed((k) => ({ ...k, [field]: e.target.value }))
                        }
                        placeholder={t.pages.ocrQueue.keyInPlaceholder}
                        aria-label={t.pages.ocrQueue.keyInAria(t.fields[field] ?? field)}
                        className="h-8 max-w-44 text-right text-sm"
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {extras.length > 0 ? (
              <div className="grid gap-x-8 gap-y-1.5 border-t border-border pt-2.5 sm:grid-cols-2">
                {extras.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{t.fields[k] ?? k}</span>
                    <span
                      className={cn(
                        "text-right",
                        mismatched.has(k) ? "font-medium text-flagged" : "text-foreground/80",
                      )}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {review.mustEscalate ? (
            <div className="space-y-1.5 rounded-lg bg-flagged-soft/70 p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-flagged">
                <ShieldAlert className="size-4" />
                {t.pages.ocrQueue.doesNotMatch}
              </div>
              <ul className="space-y-1">
                {review.issues
                  .filter((i) => i.kind === "mismatch")
                  .map((i) => (
                    <li key={i.field} className="text-pretty text-sm text-foreground">
                      {t.pages.ocrQueue.mismatchDetail(
                        t.fields[i.field] ?? i.field,
                        i.scanned,
                        i.registered,
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="space-y-2 border-t border-border pt-3">
        {review.hold && review.stage === "ready" ? (
          <p className="text-xs text-muted-foreground">{holdText(review.hold, t)}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {review.stage === "ready" ? (
            <>
              <Button size="sm" disabled={!review.canAccept || busy} onClick={accept}>
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                {t.pages.ocrQueue.accept}
              </Button>
              <Button
                size="sm"
                variant={review.mustEscalate ? "destructive" : "secondary"}
                disabled={busy}
                onClick={escalate}
              >
                <ShieldAlert className="size-3.5" />
                {t.pages.ocrQueue.escalate}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={retry}
                className="ml-auto text-muted-foreground"
              >
                <RotateCw className="size-3.5" />
                {t.pages.ocrQueue.rerun}
              </Button>
            </>
          ) : review.stage === "failed" ? (
            <>
              <Button size="sm" disabled={busy} onClick={retry}>
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCw className="size-3.5" />
                )}
                {t.pages.ocrQueue.retry}
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={reject}>
                <Ban className="size-3.5" />
                {t.pages.ocrQueue.returnToUploader}
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t.pages.ocrQueue.nothingToDo}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// --- Screen ----------------------------------------------------------------

export default function OcrQueuePage() {
  const t = useT();
  const { data, isLoading } = useDocuments({ pageSize: 100 });
  const { data: parcelsData } = useParcels({ pageSize: 100 });
  const [stage, setStage] = useState<StageKey | null>(null);

  const parcelById = new Map((parcelsData?.items ?? []).map((p) => [p.id, p]));

  const queue = (data?.items ?? [])
    .map((doc) => ({ doc, stage: stageOf(doc) }))
    .filter((x): x is { doc: LandDocument; stage: StageKey } => x.stage !== null);

  const counts = STAGES.reduce(
    (acc, s) => ({ ...acc, [s.key]: queue.filter((q) => q.stage === s.key).length }),
    {} as Record<StageKey, number>,
  );

  // Unfiltered, the list reads attention-first — the STAGES order is already
  // "needs an officer" before "needs a machine".
  const order = STAGES.map((s) => s.key);
  const shown = (stage ? queue.filter((q) => q.stage === stage) : queue).sort(
    (a, b) => order.indexOf(a.stage) - order.indexOf(b.stage),
  );

  const actionable = counts.ready + counts.failed;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.ocrQueue}
        description={t.pages.ocrQueue.description}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STAGES.map((s) => (
          <StageTile
            key={s.key}
            stage={s}
            count={counts[s.key]}
            active={stage === s.key}
            onSelect={() => setStage(stage === s.key ? null : s.key)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isLoading ? (
            t.pages.ocrQueue.loadingQueue
          ) : (
            <>
              <span className="font-medium text-foreground">
                {stage
                  ? t.pages.ocrQueue.countInStage(
                      shown.length,
                      t.pages.ocrQueue.stages[stage].label,
                    )
                  : t.pages.ocrQueue.countInQueue(shown.length)}
              </span>
              {!stage && actionable > 0 ? t.pages.ocrQueue.waitingOnYou(actionable) : null}
            </>
          )}
        </p>
        {stage ? (
          <Button variant="ghost" size="sm" onClick={() => setStage(null)}>
            {t.pages.ocrQueue.showAllStages}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={
            stage ? t.pages.ocrQueue.emptyStageTitle : t.pages.ocrQueue.emptyTitle
          }
          description={
            stage ? t.pages.ocrQueue.emptyStageBody : t.pages.ocrQueue.emptyBody
          }
        />
      ) : (
        <div className="space-y-3">
          {shown.map(({ doc }) => (
            <ExtractionCard key={doc.id} doc={doc} parcel={doc.parcelId ? parcelById.get(doc.parcelId) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

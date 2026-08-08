"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Stamp,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutations, useMutationDecision, useRole } from "@/hooks/queries";
import { mutationStatusTone } from "@/lib/status";
import { approvalGate, type MutationHold } from "@plotguard/rules";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Mutation as LandMutation, MutationStatus } from "@/lib/types";

const STATUS_FILTERS = ["all", ...(Object.keys(mutationStatusTone) as MutationStatus[])] as const;

type Scope = "all" | "assigned";

/** The gate states its reason as a code; the wording is the screen's job. */
function holdText(hold: MutationHold, t: Dictionary): string {
  return hold.code === "objections"
    ? t.pages.mutations.hold.objections(hold.count)
    : t.pages.mutations.hold.objectionWindow(hold.days);
}

function MutationCard({ mutation }: { mutation: LandMutation }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const decide = useMutationDecision(mutation.id);
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);

  const gate = approvalGate(mutation);
  const decided = mutation.status === "approved" || mutation.status === "rejected";
  const busy = decide.isPending;

  function submit(decision: "approve" | "reject") {
    decide.mutate(decision, {
      onSuccess: () => {
        setConfirming(null);
        toast.success(
          decision === "approve"
            ? t.pages.mutations.approvedTitle
            : t.pages.mutations.rejectedTitle,
          {
            description:
              decision === "approve"
                ? t.pages.mutations.approvedBody(
                    mutation.mutationNumber,
                    mutation.parcelDagNo,
                    mutation.toOwnerName,
                  )
                : t.pages.mutations.rejectedBody(mutation.mutationNumber),
          },
        );
      },
      onError: () =>
        toast.error(t.pages.mutations.failedTitle, {
          description: t.pages.mutations.failedBody,
        }),
    });
  }

  return (
    <Card className="gap-4 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{mutation.mutationNumber}</IdChip>
            <span className="text-sm text-muted-foreground">
              {t.domain.mutationType[mutation.type]}
            </span>
          </div>
          {/* The transfer itself — what this record actually changes. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-heading text-sm font-semibold text-foreground">
            <span>{mutation.fromOwnerName}</span>
            <ArrowRight
              className="size-3.5 shrink-0 text-marker"
              aria-label={t.pages.mutations.transfersTo}
            />
            <span>{mutation.toOwnerName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IdChip icon={MapPin}>{mutation.parcelDagNo}</IdChip>
          <StatusMetaBadge meta={s.mutation[mutation.status]} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{t.pages.mutations.requested(f.date(mutation.requestedAt))}</span>
        <span aria-hidden>·</span>
        <span>{t.pages.mutations.documentCount(mutation.documentIds.length)}</span>
        {mutation.fee ? (
          <>
            <span aria-hidden>·</span>
            <span className="tabular">{t.pages.mutations.fee(f.money(mutation.fee))}</span>
          </>
        ) : null}
        {mutation.decidedAt ? (
          <>
            <span aria-hidden>·</span>
            <span>{t.pages.mutations.decided(f.date(mutation.decidedAt))}</span>
          </>
        ) : null}
      </div>

      {mutation.objectionWindowEndsAt && !decided ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
            gate.daysToWindowClose !== null
              ? "bg-pending-soft text-pending"
              : "bg-muted/50 text-muted-foreground",
          )}
        >
          <Clock className="size-4 shrink-0" />
          {gate.daysToWindowClose !== null ? (
            <span>
              {t.pages.mutations.windowCloses(
                f.fromNow(mutation.objectionWindowEndsAt),
                f.date(mutation.objectionWindowEndsAt),
              )}
            </span>
          ) : (
            <span>{t.pages.mutations.windowClosed(f.date(mutation.objectionWindowEndsAt))}</span>
          )}
        </div>
      ) : null}

      {mutation.objections.length > 0 ? (
        <div className="space-y-2 rounded-lg bg-disputed-soft/60 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-disputed">
            <AlertTriangle className="size-4" />
            {t.pages.mutations.objectionsOnRecord(mutation.objections.length)}
          </div>
          <ul className="space-y-2">
            {mutation.objections.map((o) => (
              <li key={o.id} className="text-sm">
                <div className="text-xs text-muted-foreground">
                  {o.by} · {f.date(o.at)}
                </div>
                <p className="text-pretty text-foreground">{o.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2 border-t border-border pt-3">
        {gate.hold ? (
          <p className="text-xs text-muted-foreground">{holdText(gate.hold, t)}</p>
        ) : null}

        {decided ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {t.pages.mutations.closed}
            </span>
            <Link
              href={`/parcels/${mutation.parcelId}`}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              {t.pages.mutations.viewParcel}
            </Link>
          </div>
        ) : confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-foreground">
              {confirming === "approve"
                ? t.pages.mutations.confirmApprove(
                    mutation.toOwnerName,
                    mutation.parcelDagNo,
                  )
                : t.pages.mutations.confirmReject(mutation.mutationNumber)}
            </span>
            <Button
              size="sm"
              variant={confirming === "reject" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => submit(confirming)}
              className="ml-auto"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {confirming === "approve"
                ? t.pages.mutations.yesApprove
                : t.pages.mutations.yesReject}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirming(null)}
            >
              {t.common.cancel}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!gate.canApprove}
              onClick={() => setConfirming("approve")}
            >
              <Check className="size-3.5" />
              {t.pages.mutations.approve}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!gate.canReject}
              onClick={() => setConfirming("reject")}
            >
              <Ban className="size-3.5" />
              {t.pages.mutations.reject}
            </Button>
            <Link
              href={`/parcels/${mutation.parcelId}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "ml-auto text-muted-foreground",
              )}
            >
              {t.pages.mutations.viewParcel}
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}

/** `/mutations` branches by role: the land office keeps its decision queue,
 *  a citizen sees only their own filed applications plus a way to file a new
 *  one — same route and nav entry, so neither role needs its own URL. */
export default function MutationsPage() {
  const role = useRole();
  return role === "citizen" ? <CitizenMutations /> : <OfficerMutations />;
}

function MyMutationCard({ mutation }: { mutation: LandMutation }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const gate = approvalGate(mutation);
  const decided = mutation.status === "approved" || mutation.status === "rejected";

  return (
    <Card className="gap-4 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{mutation.mutationNumber}</IdChip>
            <span className="text-sm text-muted-foreground">
              {t.domain.mutationType[mutation.type]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-heading text-sm font-semibold text-foreground">
            <span>{mutation.fromOwnerName}</span>
            <ArrowRight
              className="size-3.5 shrink-0 text-marker"
              aria-label={t.pages.mutations.transfersTo}
            />
            <span>{mutation.toOwnerName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IdChip icon={MapPin}>{mutation.parcelDagNo}</IdChip>
          <StatusMetaBadge meta={s.mutation[mutation.status]} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{t.pages.mutations.requested(f.date(mutation.requestedAt))}</span>
        <span aria-hidden>·</span>
        <span>{t.pages.mutations.documentCount(mutation.documentIds.length)}</span>
        {mutation.fee ? (
          <>
            <span aria-hidden>·</span>
            <span className="tabular">{t.pages.mutations.fee(f.money(mutation.fee))}</span>
          </>
        ) : null}
        {mutation.decidedAt ? (
          <>
            <span aria-hidden>·</span>
            <span>{t.pages.mutations.decided(f.date(mutation.decidedAt))}</span>
          </>
        ) : null}
      </div>

      {mutation.objectionWindowEndsAt && !decided ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
            gate.daysToWindowClose !== null
              ? "bg-pending-soft text-pending"
              : "bg-muted/50 text-muted-foreground",
          )}
        >
          <Clock className="size-4 shrink-0" />
          {gate.daysToWindowClose !== null ? (
            <span>
              {t.pages.mutations.windowCloses(
                f.fromNow(mutation.objectionWindowEndsAt),
                f.date(mutation.objectionWindowEndsAt),
              )}
            </span>
          ) : (
            <span>{t.pages.mutations.windowClosed(f.date(mutation.objectionWindowEndsAt))}</span>
          )}
        </div>
      ) : null}

      {mutation.objections.length > 0 ? (
        <div className="space-y-2 rounded-lg bg-disputed-soft/60 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-disputed">
            <AlertTriangle className="size-4" />
            {t.pages.mutations.objectionsOnRecord(mutation.objections.length)}
          </div>
          <ul className="space-y-2">
            {mutation.objections.map((o) => (
              <li key={o.id} className="text-sm">
                <div className="text-xs text-muted-foreground">
                  {o.by} · {f.date(o.at)}
                </div>
                <p className="text-pretty text-foreground">{o.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-sm text-muted-foreground">
          {decided
            ? t.pages.mutations.closed
            : gate.hold
              ? holdText(gate.hold, t)
              : t.pages.mutations.inProgress}
        </span>
        <Link
          href={`/parcels/${mutation.parcelId}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}
        >
          {t.pages.mutations.viewParcel}
        </Link>
      </div>
    </Card>
  );
}

function CitizenMutations() {
  const t = useT();
  const s = useStatusMeta();
  const [status, setStatus] = useState<"all" | MutationStatus>("all");

  const { data, isLoading } = useMutations({
    scope: "mine",
    status: status === "all" ? undefined : status,
    pageSize: 50,
  });

  const mutations = data?.items ?? [];
  const filtered = status !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.mutations}
        description={t.pages.mutations.citizenDescription}
      >
        <Link href="/mutations/new" className={cn(buttonVariants({ size: "sm" }))}>
          <Plus className="size-4" />
          {t.pages.mutations.newApplication}
        </Link>
      </PageHeader>

      <div className="flex flex-wrap gap-1 border-b border-border pb-3">
        {STATUS_FILTERS.map((value) => (
          <Button
            key={value}
            variant={status === value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatus(value)}
          >
            {value === "all" ? t.common.all : s.mutation[value].label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : mutations.length === 0 ? (
        <EmptyState
          icon={Stamp}
          title={filtered ? t.pages.mutations.emptyFilteredTitle : t.pages.mutations.citizenEmptyTitle}
          description={
            filtered ? t.pages.mutations.emptyFilteredBody : t.pages.mutations.citizenEmptyBody
          }
        >
          {filtered ? null : (
            <Link href="/mutations/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="size-4" />
              {t.pages.mutations.newApplication}
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {mutations.map((m) => (
            <MyMutationCard key={m.id} mutation={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfficerMutations() {
  const t = useT();
  const s = useStatusMeta();
  const [scope, setScope] = useState<Scope>("all");
  const [status, setStatus] = useState<"all" | MutationStatus>("all");

  const { data, isLoading } = useMutations({
    scope: scope === "assigned" ? "assigned" : undefined,
    status: status === "all" ? undefined : status,
    pageSize: 50,
  });

  const mutations = data?.items ?? [];
  const total = data?.total ?? 0;
  const filtered = scope !== "all" || status !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.mutations}
        description={t.pages.mutations.description}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant={scope === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setScope("all")}
          >
            {t.pages.mutations.allInJurisdiction}
          </Button>
          <Button
            variant={scope === "assigned" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setScope("assigned")}
          >
            {t.pages.mutations.assignedToMe}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((value) => (
            <Button
              key={value}
              variant={status === value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatus(value)}
            >
              {value === "all" ? t.common.all : s.mutation[value].label}
            </Button>
          ))}
        </div>
      </div>

      <p className="border-t border-border pt-4 text-sm text-muted-foreground" aria-live="polite">
        {isLoading ? (
          t.pages.mutations.loadingQueue
        ) : (
          <span className="font-medium text-foreground">
            {t.pages.mutations.requestCount(total)}
          </span>
        )}
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : mutations.length === 0 ? (
        <EmptyState
          icon={Stamp}
          title={
            filtered
              ? t.pages.mutations.emptyFilteredTitle
              : t.pages.mutations.emptyTitle
          }
          description={
            filtered ? t.pages.mutations.emptyFilteredBody : t.pages.mutations.emptyBody
          }
        />
      ) : (
        <div className="space-y-3">
          {mutations.map((m) => (
            <MutationCard key={m.id} mutation={m} />
          ))}
        </div>
      )}
    </div>
  );
}

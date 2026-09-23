"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { mutationActionState } from "@/components/mutations/mutation-action-state";
import { MutationDecisionDialog } from "@/components/mutations/mutation-decision-dialog";
import { MutationDetailDialog } from "@/components/mutations/mutation-detail-dialog";
import {
  mutationDecisionSuccessState,
  retryMutationQueue,
} from "@/components/mutations/mutation-page-state.mjs";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCompleteMutationVerification,
  useMutations,
  useMutationDecision,
  usePayMutationDcr,
  useRole,
  useSession,
  useStartMutationVerification,
} from "@/hooks/queries";
import { approvalGate, type MutationHold } from "@plotguard/rules";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Mutation as LandMutation, MutationStatus } from "@/lib/types";

const MUTATION_STATUSES = [
  "submitted",
  "under-primary-verification",
  "field-investigation",
  "field-verification-complete",
  "approved",
  "rejected",
  "awaiting-dcr-payment",
  "complete",
] as const satisfies readonly MutationStatus[];

const STATUS_FILTERS = [
  "all",
  "submitted",
  "under-primary-verification",
  "field-investigation",
  "field-verification-complete",
  "approved",
  "rejected",
  "awaiting-dcr-payment",
  "complete",
] as const;

const SCOPE_FILTERS = ["all", "assigned"] as const;

// The route integrates all three workflow mutations. Start runs directly on
// a queue card; complete and decision run in the composed workflow dialogs.
const MUTATION_WORKFLOW_HOOKS = {
  useStartMutationVerification,
  useCompleteMutationVerification,
  useMutationDecision,
} as const;

type Scope = "all" | "assigned";

function isMutationStatus(value: string | null): value is MutationStatus {
  return value !== null && MUTATION_STATUSES.includes(value as MutationStatus);
}

/** The gate states its reason as a code; the wording is the screen's job. */
function holdText(hold: MutationHold, t: Dictionary): string {
  switch (hold.code) {
    case "objections":
      return t.pages.mutations.hold.objections(hold.count);
    case "objection-window":
      return t.pages.mutations.hold.objectionWindow(hold.days);
    case "no-recipient":
      return t.pages.mutations.hold.noRecipient;
  }
}

function MutationCard({
  mutation,
  actorId,
  actionsReady,
  onOpenDetail,
  onOpenDecision,
}: {
  mutation: LandMutation;
  actorId: string;
  actionsReady: boolean;
  onOpenDetail: () => void;
  onOpenDecision: (decision: "approve" | "reject") => void;
}) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const start = MUTATION_WORKFLOW_HOOKS.useStartMutationVerification(mutation.id);
  const action = mutationActionState(mutation, actorId);
  const assignmentBlocked = action.holdCode === "assigned-to-other-officer";
  const controlsDisabled = !actionsReady || assignmentBlocked;
  const availableWhenAssigned = assignmentBlocked
    ? mutationActionState({ ...mutation, assignedOfficerId: actorId }, actorId)
    : action;
  const primary = action.primary ?? availableWhenAssigned.primary;
  const gate = approvalGate(mutation);
  const decided = action.terminal !== null;

  function startVerification() {
    start.mutate(undefined, {
      onSuccess: () =>
        toast.success(t.pages.mutations.verificationStartedTitle, {
          description: t.pages.mutations.verificationStartedBody,
        }),
      onError: () =>
        toast.error(t.pages.mutations.startVerificationFailedTitle, {
          description: t.pages.mutations.startVerificationFailedBody,
        }),
    });
  }

  return (
    <Card className="relative gap-4 px-5">
      <button
        type="button"
        aria-label={`${t.pages.mutations.detailTitle}: ${mutation.mutationNumber}`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onOpenDetail}
      />
      <div className="relative z-10 pointer-events-none">
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
          {mutation.disputeId ? <StatusMetaBadge meta={s.registry.disputed} /> : null}
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
        {assignmentBlocked ? (
          <p className="text-xs text-muted-foreground">
            {t.pages.mutations.hold.assignedToOther}
          </p>
        ) : gate.hold && action.primary === null && !decided ? (
          <p className="text-xs text-muted-foreground">{holdText(gate.hold, t)}</p>
        ) : null}

        <div
          className="pointer-events-auto flex flex-wrap items-center gap-2"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {decided ? (
            <span className="text-sm text-muted-foreground">
              {t.pages.mutations.closed}
            </span>
          ) : null}

          {primary === "start-verification" ? (
            <Button
              size="sm"
              disabled={controlsDisabled || start.isPending}
              onClick={startVerification}
            >
              {start.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {start.isPending
                ? t.pages.mutations.startingVerification
                : t.pages.mutations.startVerification}
            </Button>
          ) : null}

          {primary === "complete-verification" ? (
            <Button size="sm" disabled={controlsDisabled} onClick={onOpenDetail}>
              {t.pages.mutations.completeVerification}
            </Button>
          ) : null}

          {primary === "approve" ? (
            <Button size="sm" disabled={controlsDisabled} onClick={() => onOpenDecision("approve")}>
              <Check className="size-3.5" />
              {t.pages.mutations.approve}
            </Button>
          ) : null}

          {availableWhenAssigned.canReject ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={controlsDisabled}
              onClick={() => onOpenDecision("reject")}
            >
              <Ban className="size-3.5" />
              {t.pages.mutations.reject}
            </Button>
          ) : null}

          <Link
            href={`/parcels/${mutation.parcelId}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "pointer-events-auto ml-auto text-muted-foreground",
            )}
          >
            {t.pages.mutations.viewParcel}
          </Link>
        </div>
      </div>
      </div>
    </Card>
  );
}

/** `/mutations` branches by role: the land office keeps its decision queue,
 *  a citizen sees only their own filed applications plus a way to file a new
 *  one — same route and nav entry, so neither role needs its own URL. */
export default function MutationsPage() {
  const role = useRole();
  if (role === "citizen") return <CitizenMutations />;

  return (
    <Suspense fallback={<OfficerMutationsFallback />}>
      <OfficerMutations />
    </Suspense>
  );
}

function OfficerMutationsFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-8 w-full max-w-xl" />
      </div>
      <div className="space-y-3 border-t border-border pt-4">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function MyMutationCard({ mutation, highlighted }: { mutation: LandMutation; highlighted: boolean }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const gate = approvalGate(mutation);
  const payDcr = usePayMutationDcr(mutation.id);
  const decided = mutation.status === "complete" || mutation.status === "rejected";

  return (
    <Card
      id={`mutation-${mutation.id}`}
      className={cn("scroll-mt-24 gap-4 px-5", highlighted && "ring-2 ring-primary")}
    >
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
          {mutation.disputeId ? <StatusMetaBadge meta={s.registry.disputed} /> : null}
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
        {mutation.status === "awaiting-dcr-payment" ? (
          <Button size="sm" disabled={payDcr.isPending} onClick={() => payDcr.mutate()}>
            {payDcr.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t.pages.mutations.payDcr}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function CitizenMutations() {
  const t = useT();
  const s = useStatusMeta();
  const [status, setStatus] = useState<"all" | MutationStatus>("all");
  // A notification links here as ?mutation=<id>; bring that case into view.
  const focusId = useSearchParams().get("mutation");

  const { data, isLoading } = useMutations({
    scope: "mine",
    status: status === "all" ? undefined : status,
    pageSize: 50,
  });

  const mutations = data?.items ?? [];
  const filtered = status !== "all";

  useEffect(() => {
    if (focusId && !isLoading) {
      document.getElementById(`mutation-${focusId}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [focusId, isLoading]);

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
            <MyMutationCard key={m.id} mutation={m} highlighted={m.id === focusId} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfficerMutations() {
  const t = useT();
  const s = useStatusMeta();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  // A notification links here as ?mutation=<id>; open that case straight away.
  const [selectedMutationId, setSelectedMutationId] = useState<string | undefined>(
    () => searchParams.get("mutation") ?? undefined,
  );
  const [detailOpen, setDetailOpen] = useState(() => searchParams.has("mutation"));
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);

  const scope: Scope = searchParams.get("scope") === "assigned" ? "assigned" : "all";
  const rawStatus = searchParams.get("status");
  const status: "all" | MutationStatus = isMutationStatus(rawStatus) ? rawStatus : "all";

  const { data, isLoading, isError, isFetching, refetch } = useMutations({
    scope: scope === "assigned" ? "assigned" : undefined,
    status: status === "all" ? undefined : status,
    pageSize: 50,
  });

  const mutations = data?.items ?? [];
  const total = data?.total ?? 0;
  const filtered = scope !== "all" || status !== "all";
  const actorId = session.data?.user.id;
  const loading = isLoading || session.isLoading;
  const failed = isError || session.isError || (!session.isLoading && !actorId);
  const retrying = isFetching || session.isFetching;
  const selectedMutation = mutations.find((mutation) => mutation.id === selectedMutationId);

  function replaceFilter(name: "scope" | "status", value: Scope | "all" | MutationStatus) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(name, value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function openDetail(id: string) {
    setSelectedMutationId(id);
    setDecision(null);
    setDetailOpen(true);
  }

  function openDecision(id: string, nextDecision: "approve" | "reject") {
    setSelectedMutationId(id);
    setDetailOpen(false);
    setDecision(nextDecision);
  }

  function closeDecision() {
    setDecision(null);
    setSelectedMutationId(undefined);
  }

  async function retryQueue() {
    await retryMutationQueue(() => session.refetch(), () => refetch());
  }

  function showSuccessfulDecisionDetail() {
    const next = mutationDecisionSuccessState(selectedMutationId);
    setSelectedMutationId(next.selectedMutationId);
    setDecision(next.decision);
    setDetailOpen(next.detailOpen);
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.nav.portals.landOffice}
          title={t.nav.mutations}
          description={t.pages.mutations.description}
        />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1">
            {SCOPE_FILTERS.map((value) => (
              <Button
                key={value}
                variant={scope === value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => replaceFilter("scope", value)}
              >
                {value === "all"
                  ? t.pages.mutations.allInJurisdiction
                  : t.pages.mutations.assignedToMe}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((value) => (
              <Button
                key={value}
                variant={status === value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => replaceFilter("status", value)}
              >
                {value === "all" ? t.common.all : s.mutation[value].label}
              </Button>
            ))}
          </div>
        </div>

        <p className="border-t border-border pt-4 text-sm text-muted-foreground" aria-live="polite">
          {loading ? (
            t.pages.mutations.loadingRequests
          ) : failed ? (
            t.pages.mutations.listFailed
          ) : (
            <span className="font-medium text-foreground">
              {t.pages.mutations.requestCount(total)}
            </span>
          )}
        </p>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : failed ? (
          <EmptyState
            icon={AlertTriangle}
            title={t.pages.mutations.listFailed}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={retrying}
              onClick={() => void retryQueue()}
            >
              {retrying ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t.pages.mutations.retry}
            </Button>
          </EmptyState>
        ) : mutations.length === 0 ? (
          <EmptyState
            icon={Stamp}
            title={
              filtered
                ? t.pages.mutations.emptyFilterTitle
                : t.pages.mutations.emptyQueueTitle
            }
            description={
              filtered ? t.pages.mutations.emptyFilteredBody : t.pages.mutations.emptyBody
            }
          />
        ) : (
          <div className="space-y-3">
            {mutations.map((mutation) => (
              <MutationCard
                key={mutation.id}
                mutation={mutation}
                actorId={actorId ?? ""}
                actionsReady={Boolean(actorId)}
                onOpenDetail={() => openDetail(mutation.id)}
                onOpenDecision={(nextDecision) => openDecision(mutation.id, nextDecision)}
              />
            ))}
          </div>
        )}
      </div>

      <MutationDetailDialog
        mutationId={selectedMutationId}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open && decision === null) setSelectedMutationId(undefined);
        }}
      />

      {selectedMutation && decision ? (
        <MutationDecisionDialog
          key={`${selectedMutation.id}-${decision}`}
          mutation={selectedMutation}
          decision={decision}
          open
          onSuccess={showSuccessfulDecisionDetail}
          onOpenChange={(open) => {
            if (!open) closeDecision();
          }}
        />
      ) : null}
    </>
  );
}

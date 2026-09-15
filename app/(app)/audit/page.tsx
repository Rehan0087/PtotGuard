"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, Link2, Loader2, SearchX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { IdChip } from "@/components/id-chip";
import { cn } from "@/lib/utils";
import { sentenceCase } from "@/lib/format";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import {
  useAuditEntityTypes,
  useAuditLedger,
  useUsers,
  useVerifyAudit,
} from "@/hooks/queries";
import type { AuditAction, StatusTone } from "@/lib/types";

/** Matches the endpoint's own default; the ledger is unbounded otherwise. */
const PAGE_SIZE = 20;

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

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** One row of filter chips: an "any" escape hatch plus the real options. */
function Chips({
  label,
  anyLabel,
  options,
  value,
  onChange,
  labelFor,
}: {
  label: string;
  anyLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  labelFor?: (option: string) => string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {["", ...options].map((option) => (
          <button
            key={option || "any"}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 ease-settle",
              value === option
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {option ? (labelFor ? labelFor(option) : sentenceCase(option)) : anyLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AuditPage() {
  const t = useT();
  const f = useFmt();
  const a = t.pages.audit;

  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  /**
   * Every filter change returns to page one: page 3 of the previous result
   * set means nothing in the new one, and landing on an empty page reads as
   * "no results" when there are plenty.
   */
  function apply(set: (value: string) => void) {
    return (value: string) => {
      set(value);
      setPage(1);
    };
  }

  const { data, isLoading } = useAuditLedger({
    entityType,
    action,
    actorId,
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: entityTypes = [] } = useAuditEntityTypes();
  const { data: userPage } = useUsers({ pageSize: 200 });

  const events = data?.items ?? [];
  const total = data?.total ?? 0;
  const filtered = Boolean(entityType || action || actorId || from || to);

  /** `action` is open-ended, so an unrecognised verb falls back to its raw form. */
  const actionLabel = (value: string) =>
    t.domain.auditAction[value as AuditAction] ?? sentenceCase(value);
  const verify = useVerifyAudit();
  const result = verify.data;

  function clearFilters() {
    setEntityType("");
    setAction("");
    setActorId("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.administration}
        title={t.nav.auditLedger}
        description={a.description}
      >
        <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
          {verify.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {a.verify}
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
              {result.ok ? a.chainIntact : a.chainBroken}
            </div>
            <div className="text-xs opacity-90">
              {/* Verification always walks the whole chain, filters or not — a
                  page of a chain proves nothing. */}
              {result.ok
                ? a.verifiedCount(result.checkedCount)
                : a.brokenAt((result.brokenAt?.index ?? 0) + 1)}
            </div>
          </div>
        </div>
      ) : null}

      <Card className="gap-4 px-4 py-4">
        <Chips
          label={a.entityFilter}
          anyLabel={a.allEntities}
          options={entityTypes}
          value={entityType}
          onChange={apply(setEntityType)}
        />
        <Chips
          label={a.actionFilter}
          anyLabel={a.allActions}
          options={Object.keys(t.domain.auditAction)}
          value={action}
          onChange={apply(setAction)}
          labelFor={actionLabel}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="audit-actor" className="block text-xs font-medium text-muted-foreground">
              {a.actorFilter}
            </label>
            <select
              id="audit-actor"
              className={selectClass}
              value={actorId}
              onChange={(e) => apply(setActorId)(e.target.value)}
            >
              <option value="">{a.allActors}</option>
              {(userPage?.items ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-from" className="block text-xs font-medium text-muted-foreground">
              {a.fromFilter}
            </label>
            <Input
              id="audit-from"
              type="date"
              className="h-8"
              value={from}
              onChange={(e) => apply(setFrom)(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="audit-to" className="block text-xs font-medium text-muted-foreground">
              {a.toFilter}
            </label>
            <Input
              id="audit-to"
              type="date"
              className="h-8"
              value={to}
              onChange={(e) => apply(setTo)(e.target.value)}
            />
          </div>
        </div>

        {filtered ? (
          <div>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {a.clear}
            </Button>
          </div>
        ) : null}
      </Card>

      {!isLoading && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{a.resultCount(events.length, total)}</span>
          {total > PAGE_SIZE ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {a.prev}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                {a.next}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={SearchX} title={a.emptyTitle} description={a.emptyBody} />
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
                  <span title={e.prevHash || a.genesisTitle}>
                    {a.prevLabel}&nbsp;
                    {e.prevHash ? `${e.prevHash.slice(0, 10)}…` : a.prevGenesis}
                  </span>
                  <span aria-hidden>→</span>
                  <span title={e.hash} className="text-foreground/80">
                    {a.hashLabel}&nbsp;{e.hash.slice(0, 10)}…
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

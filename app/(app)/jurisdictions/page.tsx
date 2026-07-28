"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  Loader2,
  MapPin,
  Plus,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Users2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateJurisdiction,
  useDeleteJurisdiction,
  useJurisdictions,
  useParcels,
  useUpdateJurisdiction,
  useUsers,
} from "@/hooks/queries";
import {
  LEVELS,
  ancestryOf,
  buildTree,
  childLevelOf,
  countByLevel,
  deletionGate,
  eligibleParents,
  parentLevelOf,
  reviewDraft,
  suggestCode,
  usageOf,
  type DeletionBlocker,
  type JurisdictionDraft,
  type JurisdictionError,
  type JurisdictionNode,
  type JurisdictionUsage,
  type JurisdictionWarning,
} from "@plotguard/rules";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";
import { JurisdictionName, useJurisdictionName } from "@/components/jurisdiction-name";
import { cn } from "@/lib/utils";
import type { Jurisdiction, JurisdictionLevel, Parcel, User } from "@/lib/types";

// The rules in lib/jurisdictions.ts state their reasons as codes plus the names
// and levels the sentence needs; turning those into a sentence is the screen's
// job, so the same rule can explain itself in any language.

function errorText(error: JurisdictionError, t: Dictionary): string {
  const e = t.pages.jurisdictions.error;
  const level = (l: JurisdictionLevel) => t.domain.jurisdictionLevel[l];
  switch (error.code) {
    case "name-required":
      return e.nameRequired;
    case "code-required":
      return e.codeRequired;
    case "code-pattern":
      return e.codePattern;
    case "code-taken":
      return e.codeTaken(error.holderName, error.holderCode);
    case "division-has-no-parent":
      return e.divisionHasNoParent;
    case "parent-required":
      return e.parentRequired(level(error.needs), level(error.level));
    case "parent-missing":
      return e.parentMissing;
    case "parent-wrong-level":
      return e.parentWrongLevel(
        level(error.level),
        level(error.needs),
        error.parentName,
        level(error.parentLevel),
      );
    case "self-parent":
      return e.selfParent;
    case "cycle":
      return e.cycle(error.parentName, error.currentName ?? e.thisOne);
    case "children-stranded":
      return e.childrenStranded(
        error.count,
        error.exampleName,
        level(error.exampleLevel),
        error.wants ? level(error.wants) : null,
      );
  }
}

function warningText(warning: JurisdictionWarning, t: Dictionary): string {
  const w = t.pages.jurisdictions.warning;
  switch (warning.code) {
    case "code-prefix":
      return w.codePrefix(warning.parentCode);
    case "stale-descendant-codes":
      return w.staleDescendantCodes(warning.count, warning.currentCode);
    case "sibling-name":
      return w.siblingName(warning.name);
  }
}

function blockerText(
  blocker: DeletionBlocker,
  t: Dictionary,
): { label: string; fix: string } {
  const b = t.pages.jurisdictions.blocker;
  switch (blocker.code) {
    case "missing":
      return b.missing;
    case "children":
      return b.children(
        blocker.count,
        blocker.childLevel ? t.domain.jurisdictionLevel[blocker.childLevel] : null,
      );
    case "parcels":
      return b.parcels(blocker.count);
    case "users":
      return b.users(blocker.count);
  }
}

// --- Small shared pieces ---------------------------------------------------

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-pretty text-xs text-flagged">{error}</p>
      ) : hint ? (
        <p className="text-pretty text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Stat({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const f = useFmt();
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
      <div className="font-heading text-xl font-semibold leading-none tabular-nums text-foreground">
        {f.number(value)}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground/80">{sub}</div> : null}
    </div>
  );
}

// --- Tree ------------------------------------------------------------------

interface TreeRowProps {
  node: JurisdictionNode;
  selectedId: string | null;
  collapsed: Set<string>;
  parcelsBy: Map<string, number>;
  usersBy: Map<string, number>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild: (parent: Jurisdiction) => void;
}

function TreeRow({
  node,
  selectedId,
  collapsed,
  parcelsBy,
  usersBy,
  onSelect,
  onToggle,
  onAddChild,
}: TreeRowProps) {
  const t = useT();
  const f = useFmt();
  // Screen readers get the name in the reader's script, not the canonical one.
  const readableName = useJurisdictionName();
  const j = node.jurisdiction;
  const hasChildren = node.children.length > 0;
  const expanded = !collapsed.has(j.id);
  const selected = selectedId === j.id;
  const parcels = parcelsBy.get(j.id) ?? 0;
  const users = usersBy.get(j.id) ?? 0;
  const childLevel = childLevelOf(j.level);

  return (
    <li>
      <div className="group/row flex items-center gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t.pages.jurisdictions.collapse(readableName(j))
                : t.pages.jurisdictions.expand(readableName(j))
            }
            onClick={() => onToggle(j.id)}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
            />
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          aria-current={selected ? "true" : undefined}
          onClick={() => onSelect(j.id)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
            selected ? "bg-secondary ring-1 ring-marker" : "hover:bg-muted/60",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {j.name}
            {j.nameBn ? (
              <span lang="bn" className="ml-1.5 font-normal text-muted-foreground">
                {j.nameBn}
              </span>
            ) : null}
          </span>
          <IdChip className="shrink-0">{j.code}</IdChip>
          {parcels > 0 || users > 0 ? (
            <span className="hidden shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground sm:flex">
              {parcels > 0 ? (
                <span
                  className="inline-flex items-center gap-1"
                  title={t.pages.jurisdictions.parcelsHereTitle(parcels)}
                >
                  <MapPin className="size-3" />
                  {f.number(parcels)}
                </span>
              ) : null}
              {users > 0 ? (
                <span
                  className="inline-flex items-center gap-1"
                  title={t.pages.jurisdictions.usersHereTitle(users)}
                >
                  <Users2 className="size-3" />
                  {f.number(users)}
                </span>
              ) : null}
            </span>
          ) : null}
        </button>

        {childLevel ? (
          <button
            type="button"
            aria-label={t.pages.jurisdictions.addChildAria(
              t.domain.jurisdictionLevel[childLevel],
              readableName(j),
            )}
            title={t.pages.jurisdictions.addChildTitle(
              t.domain.jurisdictionLevel[childLevel],
            )}
            onClick={() => onAddChild(j)}
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 sm:opacity-0",
              selected && "sm:opacity-100",
            )}
          >
            <Plus className="size-3.5" />
          </button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden />
        )}
      </div>

      {hasChildren && expanded ? (
        <ul className="ml-[10px] mt-0.5 space-y-0.5 border-l border-border pl-3">
          {node.children.map((child) => (
            <TreeRow
              key={child.jurisdiction.id}
              node={child}
              selectedId={selectedId}
              collapsed={collapsed}
              parcelsBy={parcelsBy}
              usersBy={usersBy}
              onSelect={onSelect}
              onToggle={onToggle}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// --- Form ------------------------------------------------------------------

function JurisdictionForm({
  initial,
  all,
  usage,
  onSaved,
  onCancel,
}: {
  initial: JurisdictionDraft;
  all: Jurisdiction[];
  /** Editing only — what a re-parent would carry with it. */
  usage?: JurisdictionUsage;
  onSaved: (saved: Jurisdiction) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const editing = Boolean(initial.id);
  const parentName = useJurisdictionName();
  const [draft, setDraft] = useState<JurisdictionDraft>(initial);
  const create = useCreateJurisdiction();
  const update = useUpdateJurisdiction();

  const pending = create.isPending || update.isPending;
  const serverError = create.error ?? update.error;
  const review = reviewDraft(draft, all);
  const parents = eligibleParents(draft.level, all, initial.id);
  const needsParent = parentLevelOf(draft.level);
  const dirty =
    draft.name !== initial.name ||
    (draft.nameBn ?? "") !== (initial.nameBn ?? "") ||
    draft.code !== initial.code ||
    draft.level !== initial.level ||
    draft.parentId !== initial.parentId;
  const moving = editing && draft.parentId !== initial.parentId;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!review.valid || pending || (editing && !dirty)) return;

    const body = {
      name: draft.name.trim(),
      nameBn: draft.nameBn?.trim() || undefined,
      code: draft.code.trim().toUpperCase(),
      level: draft.level,
      parentId: draft.parentId,
    };
    const done = (saved: Jurisdiction) => {
      toast.success(
        editing
          ? t.pages.jurisdictions.updatedTitle
          : t.pages.jurisdictions.addedTitle,
        {
          description: t.pages.jurisdictions.savedBody(saved.name, saved.code, editing),
        },
      );
      onSaved(saved);
    };

    if (editing) update.mutate({ id: initial.id!, ...body }, { onSuccess: done });
    else create.mutate(body, { onSuccess: done });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.pages.jurisdictions.name}
          htmlFor="j-name"
          error={review.errors.name && errorText(review.errors.name, t)}
        >
          <Input
            id="j-name"
            value={draft.name}
            aria-invalid={Boolean(review.errors.name)}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder={t.pages.jurisdictions.namePlaceholder}
          />
        </Field>

        <Field
          label={t.pages.jurisdictions.nameBn}
          htmlFor="j-name-bn"
          hint={t.pages.jurisdictions.nameBnHint}
        >
          <Input
            id="j-name-bn"
            lang="bn"
            value={draft.nameBn ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, nameBn: e.target.value }))}
            placeholder={t.pages.jurisdictions.nameBnPlaceholder}
          />
        </Field>

        <Field
          label={t.pages.jurisdictions.code}
          htmlFor="j-code"
          error={review.errors.code && errorText(review.errors.code, t)}
          hint={t.pages.jurisdictions.codeHint}
        >
          <Input
            id="j-code"
            value={draft.code}
            aria-invalid={Boolean(review.errors.code)}
            onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
            placeholder={t.pages.jurisdictions.codePlaceholder}
            className="tabular"
          />
        </Field>

        <Field
          label={t.pages.jurisdictions.level}
          error={review.errors.level && errorText(review.errors.level, t)}
        >
          <Select
            value={draft.level}
            onValueChange={(value) => {
              const level = value as JurisdictionLevel;
              setDraft((d) => {
                // A level change can strand the parent — re-point it at one
                // that is legal for the new rung rather than leaving it wrong.
                const options = eligibleParents(level, all, initial.id);
                const keep = options.some((p) => p.id === d.parentId);
                return {
                  ...d,
                  level,
                  parentId: keep ? d.parentId : (options[0]?.id ?? null),
                };
              });
            }}
          >
            <SelectTrigger className="w-full" aria-invalid={Boolean(review.errors.level)}>
              <SelectValue>
                {(value: string) =>
                  t.domain.jurisdictionLevel[value as JurisdictionLevel]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {t.domain.jurisdictionLevel[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={t.pages.jurisdictions.sitsUnder}
          error={review.errors.parentId && errorText(review.errors.parentId, t)}
          hint={
            !needsParent
              ? t.pages.jurisdictions.divisionIsTop
              : parents.length === 0
                ? t.pages.jurisdictions.noParentYet(
                    t.domain.jurisdictionLevel[needsParent],
                  )
                : undefined
          }
        >
          {needsParent && parents.length > 0 ? (
            <Select
              value={draft.parentId ?? parents[0].id}
              onValueChange={(value) => setDraft((d) => ({ ...d, parentId: value as string }))}
            >
              <SelectTrigger className="w-full" aria-invalid={Boolean(review.errors.parentId)}>
                <SelectValue>
                  {(value: string) =>
                    parentName(all.find((j) => j.id === value)) || t.common.notAvailable
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {parents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <JurisdictionName jurisdiction={p} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex h-8 items-center rounded-lg border border-dashed border-border px-2.5 text-sm text-muted-foreground">
              {needsParent
                ? t.pages.jurisdictions.nothingToSitUnder
                : t.pages.jurisdictions.topOfTree}
            </div>
          )}
        </Field>
      </div>

      {/* Coverage is inherited downward, so a move takes the whole subtree with
          it — say so before it happens, not after. */}
      {moving && usage && usage.subtree.parcels + usage.subtree.users > 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-pending-soft px-3 py-2 text-xs text-pending">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="text-pretty">
            {t.pages.jurisdictions.movingWarning(
              usage.subtree.parcels,
              usage.subtree.users,
            )}
          </span>
        </p>
      ) : null}

      {review.warnings.length > 0 ? (
        <ul className="space-y-1.5">
          {review.warnings.map((warning) => (
            <li
              key={warning.code}
              className="flex items-start gap-2 text-pretty text-xs text-muted-foreground"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-pending" />
              {warningText(warning, t)}
            </li>
          ))}
        </ul>
      ) : null}

      {serverError ? (
        <p className="rounded-lg bg-flagged-soft px-3 py-2 text-pretty text-xs text-flagged">
          {serverError.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!review.valid || pending || (editing && !dirty)}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {editing
            ? t.pages.jurisdictions.saveChanges
            : t.pages.jurisdictions.addToTree}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          {editing ? t.pages.jurisdictions.discard : t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

// --- Deletion --------------------------------------------------------------

function DeletePanel({
  target,
  all,
  users,
  parcels,
  onDeleted,
}: {
  target: Jurisdiction;
  all: Jurisdiction[];
  users: User[];
  parcels: Parcel[];
  onDeleted: () => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteJurisdiction();
  const gate = deletionGate(target.id, all, users, parcels);

  // The rule is referential, so the honest thing is to name what is pointing at
  // it — a greyed-out button tells an admin nothing about what to go and fix.
  if (!gate.canDelete) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldAlert className="size-4 shrink-0 text-pending" />
          {t.pages.jurisdictions.stillInUse}
        </p>
        <ul className="mt-2 space-y-1">
          {gate.blockers.map((blocker) => {
            const { label, fix } = blockerText(blocker, t);
            return (
              <li key={blocker.code} className="text-pretty text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{label}</span> — {fix}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-flagged hover:bg-flagged-soft hover:text-flagged"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-3.5" />
        {t.pages.jurisdictions.remove(target.name)}
      </Button>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg bg-flagged-soft px-3 py-2.5">
      <p className="text-pretty text-sm text-flagged">
        {t.pages.jurisdictions.confirmRemove(target.name)}
      </p>
      {remove.error ? (
        <p className="text-pretty text-xs text-flagged">{remove.error.message}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(target.id, {
              onSuccess: () => {
                toast.success(t.pages.jurisdictions.removedTitle, {
                  description: t.pages.jurisdictions.removedBody(target.name),
                });
                onDeleted();
              },
            })
          }
        >
          {remove.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t.pages.jurisdictions.removeIt}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => setConfirming(false)}
        >
          {t.pages.jurisdictions.keepIt}
        </Button>
      </div>
    </div>
  );
}

// --- Screen ----------------------------------------------------------------

export default function JurisdictionsPage() {
  const t = useT();
  const nodeName = useJurisdictionName();
  const { data: jurisdictions, isLoading } = useJurisdictions();
  const { data: usersData } = useUsers({ pageSize: 100 });
  const { data: parcelsData } = useParcels({ pageSize: 100 });

  const all = useMemo(() => jurisdictions ?? [], [jurisdictions]);
  const users = useMemo(() => usersData?.items ?? [], [usersData]);
  const parcels = useMemo(() => parcelsData?.items ?? [], [parcelsData]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<JurisdictionDraft | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { roots, unreachable } = useMemo(() => buildTree(all), [all]);
  const counts = useMemo(() => countByLevel(all), [all]);
  const parcelsBy = useMemo(() => tally(parcels.map((p) => p.jurisdictionId)), [parcels]);
  const usersBy = useMemo(() => tally(users.map((u) => u.jurisdictionId)), [users]);

  const selected = all.find((j) => j.id === selectedId) ?? null;
  const usage = selected ? usageOf(selected.id, all, users, parcels) : null;
  const ancestry = selected ? ancestryOf(selected.id, all).slice(0, -1) : [];
  const childLevel = selected ? childLevelOf(selected.level) : null;

  function startChild(parent: Jurisdiction) {
    const level = childLevelOf(parent.level);
    if (!level) return;
    setSelectedId(parent.id);
    setDrafting({ name: "", code: suggestCode(parent), level, parentId: parent.id });
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(parent.id);
      return next;
    });
  }

  function startRoot() {
    setSelectedId(null);
    setDrafting({ name: "", code: "", level: "division", parentId: null });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.administration}
        title={t.nav.jurisdictions}
        description={t.pages.jurisdictions.description}
      >
        <Button size="sm" onClick={startRoot}>
          <Plus className="size-3.5" />
          {t.pages.jurisdictions.newJurisdiction}
        </Button>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-12">
        {/* The tree — the primary control. */}
        <section className="xl:col-span-5">
          <Card className="gap-3 px-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t.pages.jurisdictions.hierarchy}
              </h2>
              <span className="text-xs text-muted-foreground">
                {LEVELS.filter((level) => counts[level] > 0)
                  .map((level) =>
                    t.pages.jurisdictions.levelCount(
                      counts[level],
                      t.domain.jurisdictionLevel[level],
                      t.domain.jurisdictionLevelPlural[level],
                    ),
                  )
                  .join(" · ") || t.pages.jurisdictions.empty}
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-8 rounded-md" />
                ))}
              </div>
            ) : roots.length === 0 && unreachable.length === 0 ? (
              <EmptyState
                icon={Building2}
                title={t.pages.jurisdictions.emptyTreeTitle}
                description={t.pages.jurisdictions.emptyTreeBody}
              >
                <Button size="sm" onClick={startRoot}>
                  <Plus className="size-3.5" />
                  {t.pages.jurisdictions.addDivision}
                </Button>
              </EmptyState>
            ) : (
              <ul className="space-y-0.5">
                {roots.map((node) => (
                  <TreeRow
                    key={node.jurisdiction.id}
                    node={node}
                    selectedId={selectedId}
                    collapsed={collapsed}
                    parcelsBy={parcelsBy}
                    usersBy={usersBy}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setDrafting(null);
                    }}
                    onToggle={(id) =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    onAddChild={startChild}
                  />
                ))}
              </ul>
            )}

            {/* Broken parent links would otherwise vanish from the tree, and a
                jurisdiction nobody can see is one nobody can fix. */}
            {unreachable.length > 0 ? (
              <div className="space-y-1.5 rounded-lg bg-flagged-soft px-3 py-2.5">
                <p className="flex items-center gap-2 text-sm font-medium text-flagged">
                  <TriangleAlert className="size-4 shrink-0" />
                  {t.pages.jurisdictions.unreachableTitle}
                </p>
                <p className="text-pretty text-xs text-flagged/90">
                  {t.pages.jurisdictions.unreachableBody}
                </p>
                <ul className="space-y-0.5 pt-1">
                  {unreachable.map((j) => (
                    <li key={j.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(j.id);
                          setDrafting(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-foreground hover:bg-card/60"
                      >
                        <JurisdictionName
                          jurisdiction={j}
                          className="min-w-0 flex-1 truncate"
                        />
                        <IdChip className="shrink-0">{j.code}</IdChip>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </section>

        {/* The inspector — one node, or a node being drafted. */}
        <section className="xl:col-span-7">
          {drafting ? (
            <Card className="gap-4 px-5">
              <div>
                <h2 className="font-heading text-base font-medium text-foreground">
                  {t.pages.jurisdictions.newLevel(
                    t.domain.jurisdictionLevel[drafting.level],
                  )}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {drafting.parentId
                    ? t.pages.jurisdictions.under(
                        nodeName(all.find((j) => j.id === drafting.parentId)) ||
                          t.common.notAvailable,
                      )
                    : t.pages.jurisdictions.atTop}
                </p>
              </div>
              <JurisdictionForm
                key={`new-${drafting.parentId ?? "root"}-${drafting.level}`}
                initial={drafting}
                all={all}
                onSaved={(saved) => {
                  setDrafting(null);
                  setSelectedId(saved.id);
                }}
                onCancel={() => setDrafting(null)}
              />
            </Card>
          ) : selected && usage ? (
            <Card className="gap-5 px-5">
              <div className="space-y-1.5">
                {ancestry.length > 0 ? (
                  <nav
                    aria-label={t.pages.jurisdictions.ancestry}
                    className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
                  >
                    {ancestry.map((step, i) => (
                      <span key={step.id} className="inline-flex items-center gap-1">
                        {i > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
                        <button
                          type="button"
                          onClick={() => setSelectedId(step.id)}
                          className="rounded hover:text-foreground hover:underline"
                        >
                          <JurisdictionName jurisdiction={step} />
                        </button>
                      </span>
                    ))}
                  </nav>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-base font-medium text-foreground">
                    {selected.name}
                  </h2>
                  {selected.nameBn ? (
                    <span lang="bn" className="text-base text-muted-foreground">
                      {selected.nameBn}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-primary">
                    {t.domain.jurisdictionLevel[selected.level]}
                  </span>
                  <IdChip>{selected.code}</IdChip>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <Stat
                  value={usage.children}
                  label={
                    childLevel
                      ? usage.children === 1
                        ? t.domain.jurisdictionLevel[childLevel]
                        : t.domain.jurisdictionLevelPlural[childLevel]
                      : t.pages.jurisdictions.childrenLabel
                  }
                  sub={
                    usage.subtree.jurisdictions > usage.children
                      ? t.pages.jurisdictions.inSubtree(usage.subtree.jurisdictions)
                      : undefined
                  }
                />
                <Stat
                  value={usage.parcels}
                  label={t.pages.jurisdictions.parcelsHere(usage.parcels)}
                  sub={
                    usage.subtree.parcels > usage.parcels
                      ? t.pages.jurisdictions.withSubtree(usage.subtree.parcels)
                      : undefined
                  }
                />
                <Stat
                  value={usage.users}
                  label={t.pages.jurisdictions.usersHere(usage.users)}
                  sub={
                    usage.subtree.users > usage.users
                      ? t.pages.jurisdictions.withSubtree(usage.subtree.users)
                      : undefined
                  }
                />
              </div>

              <JurisdictionForm
                key={selected.id}
                initial={{
                  id: selected.id,
                  name: selected.name,
                  nameBn: selected.nameBn,
                  code: selected.code,
                  level: selected.level,
                  parentId: selected.parentId,
                }}
                all={all}
                usage={usage}
                onSaved={(saved) => setSelectedId(saved.id)}
                onCancel={() => setSelectedId(null)}
              />

              <div className="space-y-3 border-t border-border pt-4">
                {childLevel ? (
                  <Button size="sm" variant="secondary" onClick={() => startChild(selected)}>
                    <Plus className="size-3.5" />
                    {t.pages.jurisdictions.addChild(
                      t.domain.jurisdictionLevel[childLevel],
                    )}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t.pages.jurisdictions.bottomOfLadder}
                  </p>
                )}
                <DeletePanel
                  target={selected}
                  all={all}
                  users={users}
                  parcels={parcels}
                  onDeleted={() => setSelectedId(null)}
                />
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={Building2}
              title={t.pages.jurisdictions.pickTitle}
              description={t.pages.jurisdictions.pickBody}
            />
          )}
        </section>
      </div>
    </div>
  );
}

/** id → how many times it appears. */
function tally(ids: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

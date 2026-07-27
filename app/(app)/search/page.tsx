"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MapPin, Search, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ParcelCard } from "@/components/parcel-card";
import { ParcelMap } from "@/components/parcel-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useParcels } from "@/hooks/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { registryStatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { RegistryStatus } from "@/lib/types";

const REGISTRY_STATUSES = Object.keys(registryStatusTone) as RegistryStatus[];
const STATUS_FILTERS = ["all", ...REGISTRY_STATUSES] as const;

const PAGE_SIZE = 24;

type Mode = "quick" | "precise";

function isRegistryStatus(v: string | null): v is RegistryStatus {
  return REGISTRY_STATUSES.includes(v as RegistryStatus);
}

function SearchScreen() {
  const t = useT();
  const s = useStatusMeta();
  const pathname = usePathname();
  const params = useSearchParams();

  // The URL seeds the form once, then local state owns it — see the
  // history.replaceState effect below for why this doesn't need to sync back.
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [dag, setDag] = useState(() => params.get("dag") ?? "");
  const [khatian, setKhatian] = useState(() => params.get("khatian") ?? "");
  const [mode, setMode] = useState<Mode>(() =>
    params.get("dag") || params.get("khatian") ? "precise" : "quick",
  );
  const [status, setStatus] = useState<"all" | RegistryStatus>(() => {
    const s = params.get("status");
    return isRegistryStatus(s) ? s : "all";
  });
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [activeId, setActiveId] = useState<string | null>(null);

  const debouncedQ = useDebouncedValue(q);
  const debouncedDag = useDebouncedValue(dag);
  const debouncedKhatian = useDebouncedValue(khatian);

  // Only the active mode's fields reach the API, so switching modes doesn't
  // silently carry a stale filter.
  const criteria =
    mode === "quick"
      ? { q: debouncedQ }
      : { dag: debouncedDag, khatian: debouncedKhatian };

  const { data, isLoading, isFetching } = useParcels({
    ...criteria,
    status: status === "all" ? undefined : status,
    pageSize,
  });

  const parcels = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasCriteria = Object.values(criteria).some(Boolean) || status !== "all";

  // Keep the address bar shareable. replaceState (not the router) means no
  // re-render and no history entries — nothing to navigate back to, which is
  // why seeding state from the URL once above is enough.
  useEffect(() => {
    const next = new URLSearchParams();
    if (mode === "quick") {
      if (debouncedQ) next.set("q", debouncedQ);
    } else {
      if (debouncedDag) next.set("dag", debouncedDag);
      if (debouncedKhatian) next.set("khatian", debouncedKhatian);
    }
    if (status !== "all") next.set("status", status);
    const query = next.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, [mode, debouncedQ, debouncedDag, debouncedKhatian, status, pathname]);

  function clearAll() {
    setQ("");
    setDag("");
    setKhatian("");
    setStatus("all");
    setPageSize(PAGE_SIZE);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.searchRecords}
        description={t.pages.search.description}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant={mode === "quick" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("quick")}
          >
            {t.pages.search.quickSearch}
          </Button>
          <Button
            variant={mode === "precise" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("precise")}
          >
            {t.pages.search.byDagKhatian}
          </Button>
        </div>

        {mode === "quick" ? (
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.pages.search.quickPlaceholder}
              aria-label={t.pages.search.quickAria}
              className="pl-8"
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="search-dag">{t.pages.search.dagLabel}</Label>
              <Input
                id="search-dag"
                value={dag}
                onChange={(e) => setDag(e.target.value)}
                placeholder={t.pages.search.dagPlaceholder}
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="search-khatian">{t.pages.search.khatianLabel}</Label>
              <Input
                id="search-khatian"
                value={khatian}
                onChange={(e) => setKhatian(e.target.value)}
                placeholder={t.pages.search.khatianPlaceholder}
                className="tabular"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((value) => (
            <Button
              key={value}
              variant={status === value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatus(value)}
            >
              {value === "all" ? t.common.all : s.registry[value].label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
        <p aria-live="polite">
          {isLoading ? (
            t.pages.search.searching
          ) : (
            <>
              {hasCriteria
                ? t.pages.search.matched(t.pages.search.parcelCount(total))
                : t.pages.search.inRegister(t.pages.search.parcelCount(total))}
              {isFetching ? t.pages.search.updating : null}
            </>
          )}
        </p>
        {hasCriteria ? (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="size-3.5" />
            {t.common.clear}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
          ) : parcels.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t.pages.search.emptyTitle}
              description={t.pages.search.emptyBody}
            >
              <Button variant="secondary" size="sm" onClick={clearAll}>
                {t.pages.search.clearSearch}
              </Button>
            </EmptyState>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {parcels.map((parcel) => (
                  <div
                    key={parcel.id}
                    onMouseEnter={() => setActiveId(parcel.id)}
                    onMouseLeave={() => setActiveId(null)}
                    className={cn(
                      "rounded-xl transition-shadow",
                      activeId === parcel.id && "ring-2 ring-marker",
                    )}
                  >
                    <ParcelCard parcel={parcel} showOwner />
                  </div>
                ))}
              </div>
              {parcels.length < total ? (
                <div className="flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPageSize((s) => s + PAGE_SIZE)}
                  >
                    {t.pages.search.loadMore}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {!isLoading && parcels.length > 0 ? (
          <aside className="xl:sticky xl:top-6 xl:w-72 xl:shrink-0">
            <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <h2 className="mb-3 inline-flex items-center gap-1.5 font-heading text-sm font-semibold text-foreground">
                <MapPin className="size-3.5 text-marker" />
                {t.pages.search.whereThese}
              </h2>
              <ParcelMap
                parcels={parcels}
                activeId={activeId}
                onActiveChange={setActiveId}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <SearchScreen />
    </Suspense>
  );
}

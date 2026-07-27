"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useParcels } from "@/hooks/queries";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { registryStatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { RegistryStatus } from "@/lib/types";

const STATUS_FILTERS = ["all", ...(Object.keys(registryStatusTone) as RegistryStatus[])] as const;

export default function RecordsPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | RegistryStatus>("all");

  const { data, isLoading } = useParcels({
    q: q || undefined,
    status: status === "all" ? undefined : status,
    pageSize: 100,
  });
  const parcels = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.records}
        description={t.pages.records.description}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.pages.records.searchPlaceholder}
            className="pl-8"
          />
        </div>
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

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : parcels.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={Search}
            title={t.pages.records.emptyTitle}
            description={t.pages.records.emptyBody}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{t.pages.records.colDagKhatian}</TableHead>
                <TableHead>{t.pages.records.colTitle}</TableHead>
                <TableHead>{t.pages.records.colOwner}</TableHead>
                <TableHead>{t.pages.records.colLandUse}</TableHead>
                <TableHead className="text-right">{t.pages.records.colArea}</TableHead>
                <TableHead>{t.pages.records.colStatus}</TableHead>
                <TableHead className="text-right">{t.pages.records.colDisputes}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcels.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/parcels/${p.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <IdChip>{p.dagNo}</IdChip>
                      <span className="tabular text-xs text-muted-foreground">#{p.khatianNo}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate font-medium text-foreground">
                    {p.title}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.ownerName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.domain.landUse[p.landUse]}
                  </TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">
                    {f.area(p.area)}
                  </TableCell>
                  <TableCell>
                    <StatusMetaBadge meta={s.registry[p.registryStatus]} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      p.openDisputeCount > 0 ? "font-medium text-disputed" : "text-muted-foreground",
                    )}
                  >
                    {p.openDisputeCount ? f.number(p.openDisputeCount) : t.common.notAvailable}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

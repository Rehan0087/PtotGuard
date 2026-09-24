"use client";

import Link from "next/link";
import { Plus, MessageCircleWarning, Clock, ServerCrash, UserX, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { useStatusMeta } from "@/lib/i18n/status";
import { grievanceSla } from "@plotguard/rules";
import { useGrievances } from "@/hooks/queries";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import type { Grievance, GrievanceCategory } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n";
import { useSessionStore } from "@/store/session";

const CATEGORY_ICONS: Record<GrievanceCategory, React.ElementType> = {
  technical: ServerCrash,
  delay: Clock,
  "staff-conduct": UserX,
  corruption: ShieldAlert,
};

function GrievanceCard({ grievance }: { grievance: Grievance }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const Icon = CATEGORY_ICONS[grievance.category];
  const sla = grievanceSla(grievance);

  // Map camelCase to dictionary keys
  const categoryKey = grievance.category === "staff-conduct" ? "staffConduct" : grievance.category;
  const categoryLabel = t.pages.grievances.category[categoryKey as keyof Dictionary["pages"]["grievances"]["category"]];

  return (
    <Link href={`/grievances/${grievance.id}`} className="block">
      <Card className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 transition-colors hover:bg-muted/50">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <Icon className="size-5" />
        </div>
        
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{categoryLabel}</h3>
            <IdChip>{grievance.caseNumber}</IdChip>
          </div>
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {grievance.description}
          </p>
        </div>

        <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 text-sm text-muted-foreground">
          <StatusMetaBadge meta={s.grievance[grievance.status]} />
          <time dateTime={grievance.createdAt}>{f.fromNow(grievance.createdAt)}</time>
          {sla.state === "overdue" ? (
            <span className="text-xs font-medium text-destructive">
              {t.pages.grievances.sla.overdue(-(sla.daysLeft ?? 0))}
            </span>
          ) : sla.state === "on-track" ? (
            <span className="text-xs">{t.pages.grievances.sla.onTrack(sla.daysLeft ?? 0)}</span>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

export default function GrievancesPage() {
  const t = useT();
  const role = useSessionStore((state) => state.role);
  const { data: grievances, isLoading } = useGrievances();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={role === "admin" ? t.nav.portals.administration : t.nav.portals.citizen}
        title={t.nav.grievances}
        description={
          role === "admin"
            ? t.pages.grievances.adminDescription
            : t.pages.grievances.description
        }
      >
        {role === "citizen" ? (
          <Link href="/grievances/new" className={cn(buttonVariants({ size: "sm" }))}>
            <Plus className="size-3.5" />
            {t.pages.grievances.file}
          </Link>
        ) : null}
      </PageHeader>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : grievances?.length === 0 ? (
        <EmptyState
          icon={MessageCircleWarning}
          title={
            role === "admin"
              ? t.pages.grievances.adminEmptyTitle
              : t.pages.grievances.emptyTitle
          }
          description={
            role === "admin"
              ? t.pages.grievances.adminEmptyBody
              : t.pages.grievances.emptyBody
          }
        >
          {role === "citizen" ? (
            <Link href="/grievances/new" className={cn(buttonVariants({ size: "sm" }))}>
              {t.pages.grievances.file}
            </Link>
          ) : null}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {grievances?.map((g) => (
            <GrievanceCard key={g.id} grievance={g} />
          ))}
        </div>
      )}
    </div>
  );
}

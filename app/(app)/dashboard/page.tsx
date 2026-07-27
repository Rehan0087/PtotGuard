"use client";

import Link from "next/link";
import { Map, Scale, FileWarning, Bell, Plus, Upload, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { ParcelCard } from "@/components/parcel-card";
import { DisputeListItem } from "@/components/dispute-list-item";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useNotificationText } from "@/lib/i18n/content";
import { useT } from "@/lib/i18n/provider";
import {
  useSession,
  useParcels,
  useDisputes,
  useDocuments,
  useNotifications,
} from "@/hooks/queries";
import type { NotificationSeverity } from "@/lib/types";

const ACTIVE_DISPUTE_STATUSES = new Set([
  "submitted",
  "under-review",
  "field-visit-scheduled",
  "in-mediation",
  "hearing-scheduled",
]);

const severityDot: Record<NotificationSeverity, string> = {
  info: "bg-review",
  success: "bg-verified",
  warning: "bg-pending",
  critical: "bg-flagged",
};

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

export default function CitizenDashboardPage() {
  const t = useT();
  const f = useFmt();
  const notificationText = useNotificationText();
  const { data: session } = useSession();
  const parcelsQ = useParcels({ owner: "me" });
  const disputesQ = useDisputes({ scope: "mine" });
  const docsQ = useDocuments({ owner: "me" });
  const { data: notifications = [] } = useNotifications();

  const firstName = session?.user.name.split(" ")[0] ?? "";
  const parcels = parcelsQ.data?.items ?? [];
  const disputes = disputesQ.data?.items ?? [];
  const activeDisputes = disputes.filter((d) => ACTIVE_DISPUTE_STATUSES.has(d.status));
  const docsToAction = (docsQ.data?.items ?? []).filter(
    (d) => d.verificationStatus === "unverified" || d.verificationStatus === "flagged",
  ).length;
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={
          firstName ? t.pages.dashboard.welcomeNamed(firstName) : t.pages.dashboard.welcome
        }
        description={t.pages.dashboard.description}
      >
        <Link href="/documents" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Upload className="size-3.5" />
          {t.pages.dashboard.uploadDocument}
        </Link>
        <Link href="/disputes/new" className={cn(buttonVariants({ size: "sm" }))}>
          <Plus className="size-3.5" />
          {t.pages.dashboard.fileDispute}
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={t.pages.dashboard.statParcels}
          value={f.number(parcelsQ.data?.total ?? parcels.length)}
          icon={Map}
        />
        <StatTile
          label={t.pages.dashboard.statOpenDisputes}
          value={f.number(activeDisputes.length)}
          icon={Scale}
          tone={activeDisputes.length ? "marker" : "default"}
        />
        <StatTile
          label={t.pages.dashboard.statDocsToAction}
          value={f.number(docsToAction)}
          icon={FileWarning}
          tone={docsToAction ? "flagged" : "default"}
        />
        <StatTile label={t.pages.dashboard.statUnread} value={f.number(unread)} icon={Bell} />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section>
            <SectionHeader
              title={t.pages.dashboard.yourParcels}
              action={
                <Link
                  href="/search"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {t.pages.dashboard.searchAll} <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            {parcelsQ.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-56 rounded-xl" />
                ))}
              </div>
            ) : parcels.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {parcels.map((p) => (
                  <ParcelCard key={p.id} parcel={p} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Map}
                title={t.pages.dashboard.noParcelsTitle}
                description={t.pages.dashboard.noParcelsBody}
              >
                <Link href="/search" className={cn(buttonVariants({ size: "sm" }))}>
                  {t.pages.dashboard.searchRecords}
                </Link>
              </EmptyState>
            )}
          </section>

          <section>
            <SectionHeader
              title={t.pages.dashboard.activeDisputes}
              action={
                <Link
                  href="/disputes"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {t.pages.dashboard.allDisputes} <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            {disputesQ.isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : activeDisputes.length ? (
              <div className="space-y-2">
                {activeDisputes.map((d) => (
                  <DisputeListItem key={d.id} dispute={d} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Scale}
                title={t.pages.dashboard.noDisputesTitle}
                description={t.pages.dashboard.noDisputesBody}
              >
                <Link href="/disputes/new" className={cn(buttonVariants({ size: "sm" }))}>
                  {t.pages.dashboard.fileDispute}
                </Link>
              </EmptyState>
            )}
          </section>
        </div>

        <aside>
          <SectionHeader title={t.pages.dashboard.recentActivity} />
          <Card className="gap-0 px-0 py-2">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t.pages.dashboard.noActivity}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.slice(0, 6).map((n) => {
                  const { title, body } = notificationText(n);
                  return (
                  <li key={n.id} className="flex gap-2.5 px-4 py-3">
                    <span
                      className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", severityDot[n.severity])}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug text-foreground">{title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{body}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{f.fromNow(n.at)}</p>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

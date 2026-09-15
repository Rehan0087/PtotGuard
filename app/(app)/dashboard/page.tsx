"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Banknote,
  Bell,
  CalendarClock,
  ClipboardCheck,
  FileWarning,
  GitBranch,
  Map,
  Plus,
  ScanLine,
  Scale,
  ShieldAlert,
  Sprout,
  Upload,
  UserRoundSearch,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { ParcelCard } from "@/components/parcel-card";
import { DisputeListItem } from "@/components/dispute-list-item";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusMetaBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useNotificationText } from "@/lib/i18n/content";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import {
  useLandOfficerDashboard,
  useLandTaxCollection,
  useRole,
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

function activityReference(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fallback;
  const details = payload as Record<string, unknown>;
  for (const key of ["applicationNo", "mutationNumber", "caseNumber", "parcelDagNo", "dagNo"]) {
    if (typeof details[key] === "string" && details[key]) return details[key];
  }
  return fallback;
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

function CitizenDashboard() {
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

function DashboardLink({
  href,
  label,
  count,
  icon: Icon,
  tone = "default",
}: {
  href: string;
  label: string;
  count: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "marker" | "flagged";
}) {
  const styles = {
    default: "border-primary/15 bg-primary/5 text-primary",
    marker: "border-marker/25 bg-marker/10 text-marker",
    flagged: "border-flagged/25 bg-flagged/10 text-flagged",
  }[tone];
  return (
    <Link href={href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full gap-3 px-4 py-4 transition-colors group-hover:border-primary/35">
        <div className="flex items-center justify-between gap-3">
          <span className={cn("flex size-9 items-center justify-center rounded-lg border", styles)}>
            <Icon className="size-4" />
          </span>
          <span className="tabular font-heading text-2xl font-semibold">{count}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm font-medium">
          {label}<ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </Link>
  );
}

function LandOfficerDashboard() {
  const t = useT();
  const f = useFmt();
  const status = useStatusMeta();
  const dashboardQ = useLandOfficerDashboard();
  const taxQ = useLandTaxCollection();
  const data = dashboardQ.data;
  const tax = taxQ.data;
  const labels = t.pages.landOfficerDashboard;
  const firstName = data?.officer.name.split(" ")[0] ?? "";
  const loading = dashboardQ.isLoading || taxQ.isLoading;

  const attention = data ? [
    { href: "/mutations", label: labels.primaryVerification, count: data.summary.primaryVerificationCount, icon: ClipboardCheck, tone: "marker" as const },
    { href: "/agents", label: labels.needsAgent, count: data.summary.needsAgentCount, icon: UserRoundSearch, tone: "marker" as const },
    { href: "/ocr-queue", label: labels.ocrReview, count: data.summary.documentsToReviewCount, icon: ScanLine, tone: "default" as const },
    { href: "/fraud-review", label: labels.fraudFlags, count: data.summary.fraudFlagCount, icon: ShieldAlert, tone: "flagged" as const },
  ] : [];
  const services = data ? [
    [labels.revenueCases, data.serviceCounts["revenue-case"] ?? 0, "/revenue-cases", Scale],
    [labels.leaseSettlement, data.serviceCounts["lease-settlement"] ?? 0, "/lease-settlement", Sprout],
    [labels.acquisition, data.serviceCounts.acquisition ?? 0, "/acquisition", Map],
    [labels.appointments, data.serviceCounts.appointment ?? 0, "/appointments", CalendarClock],
    [labels.activeFieldVisits, data.summary.activeFieldVisitCount, "/agents", UserRoundSearch],
    [labels.openServices, data.summary.openServiceCount, "/land-officer-responsibilities", Activity],
  ] as const : [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={firstName ? labels.welcomeNamed(firstName) : t.pages.dashboard.welcome}
        description={labels.description(data?.officer.jurisdictionName ?? "")}
      >
        <Link href="/land-officer-responsibilities" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {labels.viewResponsibilities}
        </Link>
        <Link href="/records" className={cn(buttonVariants({ size: "sm" }))}>
          {labels.viewRecords}<ArrowRight className="size-3.5" />
        </Link>
      </PageHeader>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-xl" />)}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={labels.statRecords} value={f.number(data.summary.recordCount)} icon={Map} />
            <StatTile label={labels.statActiveMutations} value={f.number(data.summary.activeMutationCount)} icon={GitBranch} tone={data.summary.activeMutationCount ? "marker" : "default"} />
            <StatTile label={labels.statOpenDisputes} value={f.number(data.summary.openDisputeCount)} icon={Scale} tone={data.summary.openDisputeCount ? "flagged" : "default"} />
            <StatTile
              label={labels.statTaxOutstanding}
              value={f.money({ amount: tax?.summary.outstanding ?? 0, currency: "BDT" })}
              icon={Banknote}
              tone={(tax?.summary.outstanding ?? 0) > 0 ? "marker" : "verified"}
            />
          </div>

          <section>
            <SectionHeader title={labels.attention} />
            <p className="-mt-2 mb-3 text-xs text-muted-foreground">{labels.attentionHint}</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {attention.map((item) => (
                <DashboardLink key={item.label} {...item} count={f.number(item.count)} />
              ))}
            </div>
          </section>

          <div className="grid gap-8 xl:grid-cols-3">
            <div className="space-y-8 xl:col-span-2">
              <section>
                <SectionHeader
                  title={labels.mutationWorkload}
                  action={<Link href="/mutations" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">{labels.viewAll}<ArrowRight className="size-3.5" /></Link>}
                />
                <Card className="gap-0 p-0">
                  {data.queues.mutations.length ? (
                    <ul className="divide-y divide-border">
                      {data.queues.mutations.map((mutation) => (
                        <li key={mutation.id}>
                          <Link href="/mutations" className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{mutation.mutationNumber}</p>
                              <p className="text-xs text-muted-foreground">{mutation.parcelDagNo} · {labels.submitted(f.date(mutation.requestedAt))}</p>
                            </div>
                            <StatusMetaBadge meta={status.mutation[mutation.status]} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{labels.noMutations}</p>}
                </Card>
              </section>

              <section>
                <SectionHeader
                  title={labels.disputeWorkload}
                  action={<Link href="/disputes" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">{labels.viewAll}<ArrowRight className="size-3.5" /></Link>}
                />
                {data.queues.disputes.length ? (
                  <div className="space-y-2">{data.queues.disputes.map((item) => <DisputeListItem key={item.id} dispute={item} />)}</div>
                ) : <Card><p className="py-5 text-center text-sm text-muted-foreground">{labels.noDisputes}</p></Card>}
              </section>

              <section>
                <SectionHeader title={labels.services} />
                <p className="-mt-2 mb-3 text-xs text-muted-foreground">{labels.servicesHint}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {services.map(([label, count, href, Icon]) => (
                    <Link key={label} href={href} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/35">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
                      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
                      <span className="tabular font-heading text-lg font-semibold">{f.number(count)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-8">
              <section>
                <SectionHeader title={labels.taxCollection} />
                <Link href="/land-tax" className="block">
                  <Card className="gap-3 border-verified/20 bg-gradient-to-br from-card to-verified/10">
                    <div className="flex items-center justify-between">
                      <Banknote className="size-5 text-verified" />
                      <span className="tabular font-heading text-xl font-semibold text-verified">{f.money({ amount: tax?.summary.collected ?? 0, currency: "BDT" })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {labels.taxProgress(f.number(tax?.summary.paidCount ?? 0), f.number(tax?.summary.holdingCount ?? 0), f.digits(String(tax?.assessmentYear ?? "")))}
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-verified" style={{ width: `${tax?.summary.holdingCount ? Math.round((tax.summary.paidCount / tax.summary.holdingCount) * 100) : 0}%` }} />
                    </div>
                  </Card>
                </Link>
              </section>

              <section>
                <SectionHeader title={labels.recentActivity} />
                <Card className="gap-0 px-0 py-2">
                  {data.recentActivity.length ? (
                    <ul className="divide-y divide-border">
                      {data.recentActivity.map((item) => (
                        <li key={item.id} className="flex gap-2.5 px-4 py-3">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium capitalize">{labels.activity(item.action.replaceAll("-", " "), item.entityType.replaceAll("-", " "))}</p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {activityReference(item.payload, item.entityId)} · {f.fromNow(item.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{labels.noActivity}</p>}
                </Card>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return useRole() === "land-office" ? <LandOfficerDashboard /> : <CitizenDashboard />;
}

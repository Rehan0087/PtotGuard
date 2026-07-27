"use client";

import Link from "next/link";
import { Plus, Scale } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { DisputeListItem } from "@/components/dispute-list-item";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisputes } from "@/hooks/queries";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export default function DisputesPage() {
  const t = useT();
  const { data, isLoading } = useDisputes({ scope: "mine" });
  const disputes = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.disputes}
        description={t.pages.disputes.description}
      >
        <Link href="/disputes/new" className={cn(buttonVariants({ size: "sm" }))}>
          <Plus className="size-3.5" />
          {t.pages.disputes.file}
        </Link>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : disputes.length === 0 ? (
        <EmptyState
          icon={Scale}
          title={t.pages.disputes.emptyTitle}
          description={t.pages.disputes.emptyBody}
        >
          <Link href="/disputes/new" className={cn(buttonVariants({ size: "sm" }))}>
            {t.pages.disputes.file}
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {disputes.map((d) => (
            <DisputeListItem key={d.id} dispute={d} />
          ))}
        </div>
      )}
    </div>
  );
}

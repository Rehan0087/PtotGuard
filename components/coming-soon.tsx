"use client";

import { Compass } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

/**
 * Scaffold for portal screens not yet built. The shell, data layer, hooks, and
 * design system are all wired — a teammate can build the real screen on top.
 */
export function ComingSoon({
  eyebrow,
  title,
  description,
  buildNote,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  buildNote?: string;
}) {
  const t = useT();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState
        icon={Compass}
        title={t.components.comingSoon.readyToBuild}
        description={buildNote ?? t.components.comingSoon.defaultNote}
      />
    </div>
  );
}

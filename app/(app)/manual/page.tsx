"use client";

import { PageHeader } from "@/components/page-header";
import { UserManual } from "@/components/manual/user-manual";
import { useT } from "@/lib/i18n/provider";

export default function ManualPage() {
  const t = useT();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.pages.manual.heading}
        description={t.pages.manual.description}
      />
      <UserManual />
    </div>
  );
}

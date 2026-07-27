"use client";

import { ComingSoon } from "@/components/coming-soon";
import { useT } from "@/lib/i18n/provider";

export default function PoliciesPage() {
  const t = useT();

  return (
    <ComingSoon
      eyebrow={t.nav.portals.administration}
      title={t.nav.policies}
      description={t.pages.policies.description}
      buildNote={t.pages.policies.buildNote}
    />
  );
}

"use client";

import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Building2,
  FileStack,
  GitBranch,
  Landmark,
  Map,
  Scale,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SurveyCorners } from "@/components/survey-corners";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";

/**
 * ILRDMS Level 1 — the eight land services, as a grid.
 *
 * Every service in the programme appears here whether or not its screen is
 * built, because the grid is the citizen's map of what the office does. An
 * unbuilt one is shown plainly as not-yet-available rather than hidden: a
 * service that silently disappears reads as "this office does not do that",
 * which is a worse answer than "not yet".
 */
type Service = {
  key: keyof Dictionary["pages"]["portal"]["services"] & string;
  bodyKey: keyof Dictionary["pages"]["portal"]["services"] & string;
  icon: LucideIcon;
  /** Absent until the service has a screen to open. */
  href?: string;
};

const SERVICES: Service[] = [
  { key: "mutation", bodyKey: "mutationBody", icon: GitBranch, href: "/mutations" },
  { key: "landTax", bodyKey: "landTaxBody", icon: Banknote, href: "/land-tax" },
  { key: "recordsMaps", bodyKey: "recordsMapsBody", icon: Map, href: "/search" },
  { key: "acquisition", bodyKey: "acquisitionBody", icon: Landmark },
  { key: "lease", bodyKey: "leaseBody", icon: Sprout },
  { key: "landAdmin", bodyKey: "landAdminBody", icon: Building2 },
  { key: "revenueCases", bodyKey: "revenueCasesBody", icon: Scale },
  { key: "infoBank", bodyKey: "infoBankBody", icon: FileStack },
];

export default function PortalPage() {
  const t = useT();
  const p = t.pages.portal;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.portal}
        description={p.description}
      />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          const title = p.services[service.key];
          const body = p.services[service.bodyKey];

          const inner = (
            <>
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-md",
                  service.href
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4.5" />
              </span>

              <span className="block space-y-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{title}</span>
                  {service.href ? null : (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {p.comingSoon}
                    </span>
                  )}
                </span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {body}
                </span>
              </span>

              {service.href ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  {p.openService}
                  <ArrowRight className="size-3.5" />
                </span>
              ) : null}
            </>
          );

          return (
            <li key={service.key}>
              {service.href ? (
                <Link href={service.href} className="block h-full focus-visible:outline-none">
                  <Card className="relative h-full gap-3 px-4 py-4 ring-1 ring-transparent transition-colors hover:bg-accent/40 hover:ring-border">
                    {inner}
                    <SurveyCorners size="sm" />
                  </Card>
                </Link>
              ) : (
                <Card
                  aria-disabled
                  className="h-full gap-3 px-4 py-4 opacity-70"
                >
                  {inner}
                </Card>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

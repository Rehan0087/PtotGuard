"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { LAND_OFFICER_RESPONSIBILITIES } from "@/lib/land-officer-responsibilities";

export default function LandOfficerResponsibilitiesPage() {
  const t = useT();

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-card p-4 shadow-sm">
        <h1 className="text-xl font-medium text-card-foreground">
          {t.nav.landOfficerResponsibilities}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {LAND_OFFICER_RESPONSIBILITIES.map((service) => {
          const Icon = service.icon;

          return (
            <Link
              key={service.navKey}
              href={service.href}
              className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="flex h-[220px] flex-col items-center justify-center rounded-md border border-border bg-card p-8 text-center transition-all hover:-translate-y-1 hover:shadow-md">
                <div
                  className={cn(
                    "mb-6 flex size-16 items-center justify-center rounded-md border-2",
                    service.iconColor,
                  )}
                >
                  <Icon className="size-8" strokeWidth={2} />
                </div>
                <h2 className="font-medium text-card-foreground">{t.nav[service.navKey]}</h2>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 pt-4" aria-hidden>
        <div className="size-2.5 rounded-full bg-muted-foreground" />
        <div className="size-2.5 rounded-full bg-muted" />
        <div className="size-2.5 rounded-full bg-muted" />
      </div>
    </div>
  );
}

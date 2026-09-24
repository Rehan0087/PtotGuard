"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Calculator,
  CircleHelp,
  FileSignature,
  Fingerprint,
  Info,
  LogIn,
  Map,
  Receipt,
  Scale,
  Store,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";

const ICONS: Record<string, LucideIcon> = {
  "getting-started": LogIn,
  "bhumi-id": Fingerprint,
  namjari: FileSignature,
  faraiz: Calculator,
  survey: Map,
  "land-tax": Wallet,
  marketplace: Store,
  disputes: Scale,
  payments: Receipt,
  help: CircleHelp,
};

/**
 * The citizen user manual. Rendered twice: publicly at /support (the landing
 * navbar deep-links its sections by id) and inside the signed-in shell at
 * /manual, so the text lives here once.
 */
export function UserManual() {
  const t = useT();
  const manual = t.pages.manual;

  // The sections render after hydration, so a deep link like /support#namjari
  // arrives before its target exists and the browser's own jump misses it.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="space-y-8">
      <nav aria-label={manual.contentsLabel} className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {manual.contentsLabel}
        </p>
        <ol className="grid gap-1 sm:grid-cols-2">
          {manual.sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm text-card-foreground transition-colors hover:bg-muted"
              >
                <span className="tabular w-5 shrink-0 text-muted-foreground">{index + 1}.</span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {manual.sections.map((section, index) => {
        const Icon = ICONS[section.id] ?? Info;
        return (
          <Card key={section.id} id={section.id} className="scroll-mt-24 gap-4 px-5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4.5" />
              </span>
              <div className="min-w-0 space-y-1">
                <h2 className="font-heading text-lg font-semibold text-card-foreground">
                  <span className="tabular mr-1.5 text-muted-foreground">{index + 1}.</span>
                  {section.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{section.summary}</p>
              </div>
            </div>

            <ol className="space-y-2 pl-1">
              {section.steps.map((step, stepIndex) => (
                <li key={stepIndex} className="flex gap-3 text-sm leading-relaxed text-card-foreground">
                  <span className="tabular grid size-6 shrink-0 place-items-center rounded-full border border-border text-xs text-muted-foreground">
                    {stepIndex + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>

            <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>{section.note}</p>
            </div>

            <div>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={section.link.href} />}
              >
                {manual.openLabel}: {section.link.label}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

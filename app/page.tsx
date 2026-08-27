"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Building2,
  ClipboardCheck,
  FileStack,
  Gavel,
  GitBranch,
  Landmark,
  Languages,
  Link2,
  Map,
  MapPin,
  Scale,
  ShieldCheck,
  Sprout,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useSessionStore } from "@/store/session";
import { roleHome } from "@/lib/nav";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SurveyCorners } from "@/components/survey-corners";
import { PlotGuardMark } from "@/components/shell/logo";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { cn } from "@/lib/utils";

/** Same eight tiles and icons as the in-app portal grid — one visual language. */
type Service = {
  key: keyof Dictionary["pages"]["portal"]["services"] & string;
  bodyKey: keyof Dictionary["pages"]["portal"]["services"] & string;
  icon: LucideIcon;
  live: boolean;
};

const SERVICES: Service[] = [
  { key: "mutation", bodyKey: "mutationBody", icon: GitBranch, live: true },
  { key: "landTax", bodyKey: "landTaxBody", icon: Banknote, live: true },
  { key: "recordsMaps", bodyKey: "recordsMapsBody", icon: Map, live: true },
  { key: "acquisition", bodyKey: "acquisitionBody", icon: Landmark, live: false },
  { key: "lease", bodyKey: "leaseBody", icon: Sprout, live: true },
  { key: "landAdmin", bodyKey: "landAdminBody", icon: Building2, live: true },
  { key: "revenueCases", bodyKey: "revenueCasesBody", icon: Scale, live: true },
  { key: "infoBank", bodyKey: "infoBankBody", icon: FileStack, live: false },
];

const ROLES: { key: "citizen" | "land-office" | "field-agent" | "mediator" | "admin"; icon: LucideIcon }[] = [
  { key: "citizen", icon: UserRound },
  { key: "land-office", icon: ClipboardCheck },
  { key: "field-agent", icon: MapPin },
  { key: "mediator", icon: Gavel },
  { key: "admin", icon: ShieldCheck },
];

/** Sends a signed-in visitor to their active role's landing page; everyone else sees the landing page. */
export default function RootPage() {
  const router = useRouter();
  const role = useSessionStore((s) => s.role);
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const hasHydrated = useSessionStore((s) => s.hasHydrated);

  useEffect(() => {
    if (hasHydrated && isAuthenticated) router.replace(roleHome(role));
  }, [role, isAuthenticated, hasHydrated, router]);

  if (!hasHydrated || isAuthenticated) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return <LandingPage />;
}

function LandingPage() {
  const t = useT();
  const p = t.pages.portal;
  const l = t.landing;

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <PlotGuardMark className="size-7 shrink-0 text-primary" />
            <div className="leading-none">
              <div className="font-heading text-[15px] font-semibold tracking-tight text-foreground">
                {t.common.appName}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t.common.tagline}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
            <Link href="/login" className={cn(buttonVariants({ size: "sm" }), "ml-1")}>
              {l.signIn}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/70">
        <div className="cadastral-grid absolute inset-0" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-marker/10 px-3 py-1 text-xs font-medium text-marker ring-1 ring-marker/20">
              <span className="size-1.5 rounded-full bg-marker" />
              {l.eyebrow}
            </span>
            <h1 className="text-balance font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">
              {l.heroTitle}
            </h1>
            <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              {l.heroBody}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
                {l.signIn}
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#services"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                {l.exploreServices}
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
            <HeroParcelArt />
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-border/70 bg-secondary/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
          {[
            { icon: GitBranch, value: "8", label: l.statServices },
            { icon: UserRound, value: "5", label: l.statRoles },
            { icon: Link2, value: l.statAuditValue, label: l.statAudit },
            { icon: Languages, value: "EN / বাং", label: l.statBilingual },
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <div className="font-heading text-lg font-semibold leading-tight text-foreground">
                  {s.value}
                </div>
                <div className="text-xs leading-snug text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {l.servicesTitle}
          </h2>
          <p className="text-pretty text-muted-foreground">{l.servicesBody}</p>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            const title = p.services[service.key];
            const body = p.services[service.bodyKey];
            return (
              <li key={service.key}>
                <Link
                  href="/login"
                  aria-disabled={!service.live}
                  className={cn(!service.live && "pointer-events-none")}
                >
                  <Card
                    className={cn(
                      "relative h-full gap-3 px-4 py-4 ring-1 ring-transparent transition-colors",
                      service.live ? "hover:bg-accent/40 hover:ring-border" : "opacity-70",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-md",
                        service.live ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="block space-y-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{title}</span>
                        {service.live ? null : (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {p.comingSoon}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">{body}</span>
                    </span>
                    <SurveyCorners size="sm" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Roles */}
      <section className="border-y border-border/70 bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {l.rolesTitle}
            </h2>
            <p className="text-pretty text-muted-foreground">{l.rolesBody}</p>
          </div>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <li key={r.key}>
                  <Card className="h-full gap-2.5 px-4 py-5 text-center">
                    <span className="mx-auto grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Icon className="size-4.5" />
                    </span>
                    <div className="font-heading text-sm font-semibold text-foreground">
                      {t.roles[r.key]}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {l.roleBlurbs[r.key]}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Trust / audit */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
              <Link2 className="size-3.5" />
              {l.trustEyebrow}
            </span>
            <h2 className="text-balance font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {l.trustTitle}
            </h2>
            <p className="text-pretty leading-relaxed text-muted-foreground">{l.trustBody}</p>
          </div>
          <Card className="relative gap-0 overflow-hidden px-0 py-0">
            <SurveyCorners size="md" />
            <div className="cadastral-grid px-5 py-5">
              <ol className="space-y-4">
                {l.trustSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular">
                      {i + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-foreground">{step.title}</div>
                      <div className="text-xs leading-relaxed text-muted-foreground">{step.body}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border/70 bg-primary">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-primary-foreground sm:text-3xl">
            {l.ctaTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-pretty text-primary-foreground/80">{l.ctaBody}</p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: "lg" }),
                "gap-2 bg-marker text-marker-foreground hover:bg-marker/90",
              )}
            >
              {l.signIn}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PlotGuardMark className="size-5 text-muted-foreground" />
            {t.common.appName} — {t.common.tagline}
          </div>
          <Link href="/login" className="text-sm font-medium text-primary hover:underline">
            {l.signIn}
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** Abstract, decorative parcel-map motif — not real survey data. */
function HeroParcelArt() {
  return (
    <div className="relative aspect-square w-full">
      <svg viewBox="0 0 320 320" className="size-full" aria-hidden="true">
        <defs>
          <pattern id="hero-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground/10" />
          </pattern>
        </defs>
        <rect x="8" y="8" width="304" height="304" rx="18" fill="url(#hero-grid)" />
        <rect x="8" y="8" width="304" height="304" rx="18" fill="none" stroke="currentColor" className="text-border" />

        {/* Overlapping plot boundaries */}
        <path
          d="M50 230 L70 110 L170 70 L230 120 L210 250 L100 270 Z"
          fill="var(--primary)"
          fillOpacity="0.08"
          stroke="var(--primary)"
          strokeWidth="2"
        />
        <path
          d="M170 70 L260 90 L270 190 L230 120 Z"
          fill="var(--marker)"
          fillOpacity="0.12"
          stroke="var(--marker)"
          strokeWidth="2"
        />
        <path d="M70 110 L170 70 M210 250 L270 190 M100 270 L50 230" stroke="var(--border)" strokeWidth="1.5" />

        {/* Survey marker pins at vertices */}
        {[
          [70, 110],
          [170, 70],
          [230, 120],
          [210, 250],
          [100, 270],
          [50, 230],
          [260, 90],
          [270, 190],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 5 : 3.5} fill="var(--marker)" stroke="var(--card)" strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
}

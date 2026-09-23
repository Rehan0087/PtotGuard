"use client";

import { useEffect } from "react";
import { Check, Landmark, Network, Users } from "lucide-react";
import { GovNavbar } from "@/components/shell/gov-navbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";

/** Public — the landing navbar's About Us menu links here, signed in or not. */
export default function AboutPage() {
  const t = useT();
  const about = t.pages.about;

  // Sections render after hydration, so /about#structure needs a nudge.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <GovNavbar />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8 sm:px-6 lg:py-12">
        <PageHeader title={about.heading} description={about.description} />

        <Card id="mission" className="scroll-mt-24 gap-4 px-5">
          <SectionTitle icon={Landmark} title={about.mission.title} />
          {about.mission.body.map((paragraph, i) => (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
          <ul className="grid gap-2 sm:grid-cols-2">
            {about.mission.points.map((point) => (
              <li key={point} className="flex gap-2 text-sm text-card-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {point}
              </li>
            ))}
          </ul>
        </Card>

        <Card id="structure" className="scroll-mt-24 gap-4 px-5">
          <SectionTitle icon={Network} title={about.structure.title} />
          <p className="text-sm leading-relaxed text-muted-foreground">{about.structure.intro}</p>
          <ol>
            {about.structure.levels.map((level, i) => (
              <li key={level.name} className="relative flex gap-3 pb-5 last:pb-0">
                {i < about.structure.levels.length - 1 ? (
                  <span aria-hidden className="absolute top-7 left-3.5 h-full w-px bg-border" />
                ) : null}
                <span className="tabular relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-primary bg-card text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="pt-0.5">
                  <div className="text-sm font-semibold text-card-foreground">{level.name}</div>
                  <p className="text-sm text-muted-foreground">{level.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card id="officers" className="scroll-mt-24 gap-4 px-5">
          <SectionTitle icon={Users} title={about.officers.title} />
          <p className="text-sm leading-relaxed text-muted-foreground">{about.officers.intro}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {about.officers.roles.map((role) => (
              <div key={role.name} className="rounded-lg border border-border p-4">
                <div className="text-sm font-semibold text-card-foreground">{role.name}</div>
                <p className="mt-1 text-sm text-muted-foreground">{role.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Landmark; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4.5" />
      </span>
      <h2 className="font-heading text-lg font-semibold text-card-foreground">{title}</h2>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

export default function FaqPage() {
  const t = useT();
  const faq = t.pages.faq;
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string) => setOpenId(openId === id ? null : id);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={faq.heading}
        description={faq.description}
      />

      <div className="space-y-3">
        {faq.items.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border border-border bg-card transition-shadow",
                isOpen && "shadow-sm",
              )}
            >
              <button
                onClick={() => toggle(item.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="text-sm font-medium text-card-foreground sm:text-base">
                  {item.q}
                </span>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              <div
                className={cn(
                  "grid transition-all duration-200 ease-in-out",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-border px-5 pb-5 pt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {item.a}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

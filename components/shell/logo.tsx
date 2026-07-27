"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

/**
 * The PlotGuard mark — a surveyed parcel: boundary polygon, an internal
 * subdivision line, and an amber survey marker pinned at the top vertex.
 */
export function PlotGuardMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M14 3.2 3.6 8.6v10.8L14 24.8l10.4-5.4V8.6L14 3.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 3.2v21.6M3.6 8.6 24.4 19.4"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.45"
      />
      <circle cx="14" cy="3.9" r="2.15" fill="var(--marker)" stroke="var(--sidebar)" strokeWidth="1" />
    </svg>
  );
}

/** Full brand lockup: mark + wordmark + tagline. */
export function Logo({
  className,
  tagline = true,
}: {
  className?: string;
  tagline?: boolean;
}) {
  const t = useT();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <PlotGuardMark className="size-7 shrink-0 text-sidebar-foreground" />
      <div className="leading-none">
        <div className="font-heading text-[15px] font-semibold tracking-tight text-sidebar-foreground">
          {t.common.appName}
        </div>
        {tagline ? (
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/55">
            {t.common.tagline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

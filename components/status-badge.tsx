import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/types";
import type { StatusMeta } from "@/lib/status";

// Literal class strings so Tailwind can statically extract them.
// Each references the --color-{tone}/--color-{tone}-soft tokens in globals.css.
const toneClasses: Record<StatusTone, string> = {
  verified: "bg-verified-soft text-verified border-verified/25",
  pending: "bg-pending-soft text-pending border-pending/25",
  flagged: "bg-flagged-soft text-flagged border-flagged/25",
  disputed: "bg-disputed-soft text-disputed border-disputed/25",
  review: "bg-review-soft text-review border-review/25",
  draft: "bg-draft-soft text-draft border-draft/25",
  neutral: "bg-muted text-muted-foreground border-border",
};

interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
  /** Leading status dot. On by default. */
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ tone, label, dot = true, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" />}
      {label}
    </span>
  );
}

/** Convenience wrapper for the status-meta maps in lib/status.ts. */
export function StatusMetaBadge({
  meta,
  ...rest
}: { meta: StatusMeta } & Omit<StatusBadgeProps, "tone" | "label">) {
  return <StatusBadge tone={meta.tone} label={meta.label} {...rest} />;
}

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * Compact metric tile for dashboards. Used as *secondary* information —
 * screens should lead with the parcel/case itself, not a wall of numbers.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: ComponentType<{ className?: string }>;
  hint?: React.ReactNode;
  tone?: "default" | "marker" | "flagged" | "verified";
  className?: string;
}) {
  const toneStyles = {
    default: {
      card: "border-primary/15 bg-gradient-to-br from-card to-primary/5",
      icon: "bg-primary/10 text-primary",
    },
    marker: {
      card: "border-marker/25 bg-gradient-to-br from-card to-marker/10",
      icon: "bg-marker/15 text-marker",
    },
    flagged: {
      card: "border-flagged/25 bg-gradient-to-br from-card to-flagged/10",
      icon: "bg-flagged/15 text-flagged",
    },
    verified: {
      card: "border-verified/25 bg-gradient-to-br from-card to-verified/10",
      icon: "bg-verified/15 text-verified",
    },
  }[tone];

  return (
    <Card className={cn("gap-1.5 border px-4 shadow-sm", toneStyles.card, className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <span className={cn("flex size-8 items-center justify-center rounded-lg", toneStyles.icon)}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="font-heading text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

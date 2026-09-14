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
  const accent = {
    default: "text-muted-foreground",
    marker: "text-marker",
    flagged: "text-flagged",
    verified: "text-verified",
  }[tone];

  return (
    <Card className={cn("gap-1.5 px-4", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? <Icon className={cn("size-4", accent)} /> : null}
      </div>
      <div className="font-heading text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

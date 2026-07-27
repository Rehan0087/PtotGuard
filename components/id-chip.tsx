import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Monospace identifier chip for parcel numbers, case numbers, coordinates —
 * rendered like a cadastral survey label. Uses the Space Mono `.tabular` face.
 */
export function IdChip({
  children,
  icon: Icon,
  className,
  title,
}: {
  children: React.ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "tabular inline-flex items-center gap-1 rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 text-xs text-foreground/80",
        className,
      )}
    >
      {Icon ? <Icon className="size-3 shrink-0 opacity-60" /> : null}
      {children}
    </span>
  );
}

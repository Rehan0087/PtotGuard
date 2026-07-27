import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Empty/zero states. Per our writing guidelines, an empty screen is an
 * invitation to act — always pair the message with a next step when there is one.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon className="size-5" />
        </div>
      ) : null}
      <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children ? <div className="mt-4 flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

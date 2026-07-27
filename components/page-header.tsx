import { cn } from "@/lib/utils";

/**
 * Standard screen header: an optional eyebrow, a display-face title,
 * a supporting description, and a right-aligned actions slot.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Actions, rendered right-aligned on the same row as the title. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1.5">
        {eyebrow ? (
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-marker">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-pretty text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

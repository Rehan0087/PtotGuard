import { cn } from "@/lib/utils";

/**
 * Signature motif — L-shaped survey-marker ticks at the four corners,
 * evoking cadastral map registration marks. Drop inside any
 * `position: relative` container (e.g. a Card).
 */
export function SurveyCorners({
  className,
  size = "sm",
}: {
  className?: string;
  /** Tick arm length. */
  size?: "sm" | "md";
}) {
  const arm = size === "md" ? "size-3" : "size-2";
  const base = cn("pointer-events-none absolute border-marker/45", arm, className);
  return (
    <>
      <span className={cn(base, "left-0 top-0 border-l border-t")} aria-hidden />
      <span className={cn(base, "right-0 top-0 border-r border-t")} aria-hidden />
      <span className={cn(base, "bottom-0 left-0 border-b border-l")} aria-hidden />
      <span className={cn(base, "bottom-0 right-0 border-b border-r")} aria-hidden />
    </>
  );
}

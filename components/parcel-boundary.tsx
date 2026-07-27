import type { GeoPolygon } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Renders a parcel's GeoJSON boundary as a normalized cadastral thumbnail —
 * boundary polygon, a faint survey grid, and a centroid marker. Falls back to
 * a placeholder plot when no boundary is present.
 */
export function ParcelBoundary({
  boundary,
  className,
}: {
  boundary?: GeoPolygon;
  className?: string;
}) {
  const ring = boundary?.coordinates?.[0];

  let points = "20,18 80,24 82,82 24,80"; // fallback quadrilateral
  if (ring && ring.length >= 3) {
    const xs = ring.map((c) => c[0]);
    const ys = ring.map((c) => c[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const pad = 16;
    const scale = 100 - pad * 2;
    points = ring
      .map((c) => {
        const x = pad + ((c[0] - minX) / spanX) * scale;
        // Flip Y: latitude grows upward, SVG y grows downward.
        const y = pad + (1 - (c[1] - minY) / spanY) * scale;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-full", className)}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <pattern id="pg-grid" width="12.5" height="12.5" patternUnits="userSpaceOnUse">
          <path
            d="M12.5 0H0V12.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-foreground/10"
          />
        </pattern>
      </defs>
      <rect width="100" height="100" fill="url(#pg-grid)" />
      <polygon
        points={points}
        className="fill-primary/10 stroke-primary"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <polygon
        points={points}
        className="fill-none stroke-marker/70"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeDasharray="0.1 6"
        strokeLinecap="round"
      />
    </svg>
  );
}

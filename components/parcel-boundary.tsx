import type { GeoPolygon } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Half the viewBox — the frame's centre, which every plot is drawn around. */
const CENTRE = 50;
const PAD = 16;
const DRAW = 100 - PAD * 2;

/**
 * A parcel's recorded boundary as a small cadastral thumbnail: survey grid
 * underneath, the ring drawn on top.
 *
 * **Shape is preserved.** One scale drives both axes, and longitude is
 * narrowed by cos(latitude) before scaling, so a long strip renders as a long
 * strip and a square plot as a square. An earlier version normalised each axis
 * independently, which made every parcel fill the frame as a squarish blob —
 * in a land-records system, a shape that misleads is worse than no shape.
 *
 * **Nothing is invented.** A parcel with no boundary on record renders as an
 * empty frame, not a plausible-looking placeholder quadrilateral.
 */
export function ParcelBoundary({
  boundary,
  className,
}: {
  boundary?: GeoPolygon;
  className?: string;
}) {
  const points = projectRing(boundary?.coordinates?.[0]);

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-full", className)}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        {/* One id shared across instances is intentional: every instance
            defines an identical pattern, so they resolve to the same thing. */}
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
      {points ? (
        <>
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
        </>
      ) : null}
    </svg>
  );
}

/**
 * GeoJSON ring (`[lng, lat]` pairs) → SVG points, true to shape.
 * Returns null when there is no ring worth drawing, so the caller renders an
 * empty frame rather than a fabricated one.
 */
function projectRing(ring: [number, number][] | undefined): string | null {
  if (!ring || ring.length < 3) return null;

  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const midLng = (minLng + maxLng) / 2;
  const midLat = (minLat + maxLat) / 2;

  // A degree of longitude is shorter than a degree of latitude everywhere but
  // the equator — ~0.92× at Bangladesh's latitude. Without this the map is
  // stretched east-west and every plot looks wider than it is.
  const lngNarrowing = Math.cos((midLat * Math.PI) / 180);

  // One span for both axes: that is what keeps the proportions honest.
  const span = Math.max((maxLng - minLng) * lngNarrowing, maxLat - minLat);
  if (span <= 0) return null; // a degenerate ring — all points identical

  const scale = DRAW / span;

  return ring
    .map(([lng, lat]) => {
      const x = CENTRE + (lng - midLng) * lngNarrowing * scale;
      // Flip Y: latitude grows upward, SVG y grows downward.
      const y = CENTRE - (lat - midLat) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

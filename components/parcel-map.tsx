"use client";

import { useRouter } from "next/navigation";
import type { Parcel, StatusTone } from "@/lib/types";
import { registryStatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";

// Literal class strings so Tailwind can statically extract them.
// Each references the --color-{tone} tokens in globals.css.
const markerTone: Record<StatusTone, string> = {
  verified: "text-verified",
  pending: "text-pending",
  flagged: "text-flagged",
  disputed: "text-disputed",
  review: "text-review",
  draft: "text-draft",
  neutral: "text-muted-foreground",
};

const SIZE = 100;
const PAD = 14;
/** Smallest window the projection will zoom to, in degrees (~220 m). */
const MIN_SPAN = 0.002;
/** Metres per degree of latitude — good enough for a locator caption. */
const METRES_PER_DEGREE = 111_320;

function formatExtent(degrees: number): string {
  const metres = degrees * METRES_PER_DEGREE;
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

/**
 * Plots a result set on a shared cadastral frame: boundary rings where we have
 * them, survey-marker dots where we only have a centroid. One scale drives both
 * axes so relative position and size stay honest.
 *
 * The card grid remains the primary, fully accessible path to a parcel — this
 * is a locator that answers "where are these, relative to each other".
 */
export function ParcelMap({
  parcels,
  activeId,
  onActiveChange,
  className,
}: {
  parcels: Parcel[];
  /** Parcel to emphasize — hovering a result card drives this. */
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  className?: string;
}) {
  const router = useRouter();

  if (parcels.length === 0) return null;

  const lats = parcels.map((p) => p.centroid.lat);
  const lngs = parcels.map((p) => p.centroid.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const span = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lngs) - Math.min(...lngs),
    MIN_SPAN,
  );
  const scale = (SIZE - PAD * 2) / span;

  const projectX = (lng: number) => SIZE / 2 + (lng - midLng) * scale;
  // Latitude grows upward, SVG y grows downward.
  const projectY = (lat: number) => SIZE / 2 - (lat - midLat) * scale;

  const ringPoints = (parcel: Parcel) =>
    parcel.boundary?.coordinates?.[0]
      ?.map(([lng, lat]) => `${projectX(lng).toFixed(1)},${projectY(lat).toFixed(1)}`)
      .join(" ");

  const active = parcels.find((p) => p.id === activeId) ?? null;

  const open = (id: string) => router.push(`/parcels/${id}`);

  return (
    <figure className={cn("space-y-2", className)}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="aspect-square w-full rounded-lg bg-secondary/40 ring-1 ring-foreground/10"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="pg-map-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M10 0H0V10"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.4"
              className="text-foreground/10"
            />
          </pattern>
        </defs>
        <rect width={SIZE} height={SIZE} fill="url(#pg-map-grid)" />

        {parcels.map((parcel) => {
          const points = ringPoints(parcel);
          if (!points) return null;
          const isActive = parcel.id === active?.id;
          return (
            <polygon
              key={`ring-${parcel.id}`}
              points={points}
              className={cn(
                "fill-primary/10 stroke-primary transition-opacity",
                active && !isActive && "opacity-30",
              )}
              strokeWidth="0.9"
              strokeLinejoin="round"
            />
          );
        })}

        {parcels.map((parcel) => {
          const x = projectX(parcel.centroid.lng);
          const y = projectY(parcel.centroid.lat);
          const isActive = parcel.id === active?.id;
          const tone = registryStatusTone[parcel.registryStatus];
          return (
            <g
              key={parcel.id}
              role="link"
              tabIndex={0}
              aria-label={`${parcel.dagNo} — ${parcel.title}`}
              className={cn(
                "cursor-pointer outline-none transition-opacity",
                markerTone[tone],
                active && !isActive && "opacity-35",
              )}
              onMouseEnter={() => onActiveChange?.(parcel.id)}
              onMouseLeave={() => onActiveChange?.(null)}
              onFocus={() => onActiveChange?.(parcel.id)}
              onBlur={() => onActiveChange?.(null)}
              onClick={() => open(parcel.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open(parcel.id);
                }
              }}
            >
              <title>{`${parcel.dagNo} — ${parcel.title}`}</title>
              {/* Survey-marker tick ring, then the station dot. */}
              <circle
                cx={x}
                cy={y}
                r={isActive ? 5.4 : 4}
                className="fill-none stroke-current opacity-50"
                strokeWidth="0.7"
                strokeDasharray="0.1 3"
                strokeLinecap="round"
              />
              <circle cx={x} cy={y} r={isActive ? 3 : 2} className="fill-current" />
            </g>
          );
        })}

        {active ? (
          <text
            x={Math.min(Math.max(projectX(active.centroid.lng), 16), SIZE - 16)}
            y={Math.max(projectY(active.centroid.lat) - 7.5, 6)}
            textAnchor="middle"
            fontSize="5"
            className="pointer-events-none fill-foreground font-medium"
          >
            {active.dagNo}
          </text>
        ) : null}
      </svg>

      <figcaption className="text-xs text-muted-foreground">
        {parcels.length} plotted · approx. {formatExtent(span)} across
      </figcaption>
    </figure>
  );
}

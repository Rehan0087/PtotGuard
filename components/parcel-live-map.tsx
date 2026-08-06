"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Parcel } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A real slippy map — OpenStreetMap tiles, pan and zoom — for locating a plot
 * against roads, rivers, and settlements. The SVG thumbnail
 * (`components/parcel-boundary.tsx`) shows a plot's *shape*; this shows
 * *where it is*, which a frame with no basemap cannot.
 *
 * Leaflet is driven directly rather than through react-leaflet: one
 * dependency instead of two, and no coupling to a wrapper's React-19 support.
 * It touches `window`, so every caller must load this with
 * `dynamic(..., { ssr: false })`.
 *
 * Plots are drawn as polygons where a boundary is on record and as a circle
 * marker at the centroid otherwise — never as an invented shape. Circle
 * markers also avoid Leaflet's default pin icons, whose asset paths break
 * under bundlers.
 */
export function ParcelLiveMap({
  parcels,
  focusId,
  className,
}: {
  parcels: Parcel[];
  /** Rendered in the accent colour and used to centre the initial view. */
  focusId?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const router = useRouter();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || parcels.length === 0) return;

    let cancelled = false;
    let map: LeafletMap | undefined;

    // Imported inside the effect, not at module scope: the module reads
    // `window` on evaluation, so a static import would break any server render
    // that reached this file before the dynamic() boundary took effect.
    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      map = L.map(container, { scrollWheelZoom: false, attributionControl: true });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const bounds = L.latLngBounds([]);

      for (const parcel of parcels) {
        const focused = parcel.id === focusId;
        const colour = focused ? "#c2410c" : "#3f6212";
        const ring = parcel.boundary?.coordinates?.[0];

        const shape =
          ring && ring.length >= 3
            ? // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
              L.polygon(
                ring.map(([lng, lat]) => [lat, lng] as [number, number]),
                { color: colour, weight: 2, fillOpacity: focused ? 0.25 : 0.12 },
              )
            : L.circleMarker([parcel.centroid.lat, parcel.centroid.lng], {
                radius: 7,
                color: colour,
                weight: 2,
                fillOpacity: focused ? 0.5 : 0.25,
              });

        shape
          .addTo(map)
          .bindTooltip(parcel.ulpin ? `${parcel.dagNo} · ${parcel.ulpin}` : parcel.dagNo)
          .on("click", () => router.push(`/parcels/${parcel.id}`));

        bounds.extend(
          "getBounds" in shape ? shape.getBounds() : [parcel.centroid.lat, parcel.centroid.lng],
        );
      }

      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [parcels, focusId, router]);

  if (parcels.length === 0) return null;

  return <div ref={containerRef} className={cn("z-0 h-72 w-full rounded-lg", className)} />;
}

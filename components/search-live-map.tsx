"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap, CircleMarker, Polygon, Layer } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Parcel } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Real OpenStreetMap for the search-results sidebar.
 *
 * Each parcel gets a red marker (polygon if boundary exists, circle-marker
 * otherwise) with a permanent tooltip showing its title / address. Hovering a
 * card in the grid highlights the corresponding marker here.
 *
 * Must be loaded with `dynamic(..., { ssr: false })` — Leaflet reads `window`.
 */
export function SearchLiveMap({
  parcels,
  activeId,
  onActiveChange,
  className,
}: {
  parcels: Parcel[];
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<Map<string, Layer>>(new Map());

  const router = useRouter();

  // Stable reference so the effect doesn't re-run on every render.
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || parcels.length === 0) return;

    let cancelled = false;
    let map: LeafletMap | undefined;

    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      map = L.map(container, {
        scrollWheelZoom: false,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      const layers = new Map<string, Layer>();

      for (const parcel of parcels) {
        const colour = "#c2410c"; // warm red for all markers
        const ring = parcel.boundary?.coordinates?.[0];

        const shape: CircleMarker | Polygon =
          ring && ring.length >= 3
            ? L.polygon(
                ring.map(([lng, lat]) => [lat, lng] as [number, number]),
                { color: colour, weight: 2, fillOpacity: 0.2 },
              )
            : L.circleMarker([parcel.centroid.lat, parcel.centroid.lng], {
                radius: 8,
                color: colour,
                weight: 2,
                fillColor: colour,
                fillOpacity: 0.35,
              });

        // Tooltip: show title (address-like) + dag number
        const label = `${parcel.title}\nDag ${parcel.dagNo}`;
        shape
          .addTo(map)
          .bindTooltip(label, {
            permanent: false,
            direction: "top",
            className: "plotguard-search-tooltip",
            offset: [0, -6],
          })
          .on("mouseover", () => onActiveChangeRef.current?.(parcel.id))
          .on("mouseout", () => onActiveChangeRef.current?.(null))
          .on("click", () => router.push(`/parcels/${parcel.id}`));

        layers.set(parcel.id, shape);

        bounds.extend(
          "getBounds" in shape
            ? (shape as Polygon).getBounds()
            : [parcel.centroid.lat, parcel.centroid.lng],
        );
      }

      layersRef.current = layers;

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
      }
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      layersRef.current = new Map();
    };
  }, [parcels, router]);

  // Highlight active parcel when hovering cards
  useEffect(() => {
    const layers = layersRef.current;
    if (layers.size === 0) return;

    for (const [id, layer] of layers) {
      const isActive = id === activeId;
      if ("setStyle" in layer && typeof (layer as any).setStyle === "function") {
        (layer as any).setStyle({
          weight: isActive ? 4 : 2,
          fillOpacity: isActive ? 0.45 : 0.2,
        });
      }
      if (isActive) {
        (layer as any).openTooltip?.();
        // Bring active layer to front
        if ("bringToFront" in layer && typeof (layer as any).bringToFront === "function") {
          (layer as any).bringToFront();
        }
      } else {
        (layer as any).closeTooltip?.();
      }
    }
  }, [activeId]);

  if (parcels.length === 0) return null;

  return (
    <>
      <style jsx global>{`
        .plotguard-search-tooltip {
          font-size: 11px;
          font-weight: 500;
          line-height: 1.4;
          padding: 4px 8px;
          white-space: pre-line;
          border-radius: 6px;
          border: 1px solid rgba(194, 65, 12, 0.3);
          background: rgba(255, 255, 255, 0.95);
          color: #1a1a1a;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
      `}</style>
      <div
        ref={containerRef}
        className={cn("z-0 h-72 w-full rounded-lg", className)}
      />
    </>
  );
}

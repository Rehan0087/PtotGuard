"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { KhasLandPlot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

/**
 * A live slippy map for browsing Khas Land Plots.
 */
export function KhasLandMap({
  plots,
  selectedId,
  onSelect,
  className,
}: {
  plots: KhasLandPlot[];
  selectedId?: string;
  onSelect?: (plot: KhasLandPlot) => void;
  className?: string;
}) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: LeafletMap | undefined;

    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      map = L.map(container, { scrollWheelZoom: false, attributionControl: true });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const bounds = L.latLngBounds([]);

      for (const plot of plots) {
        const isSelected = plot.id === selectedId;
        // green for available, orange for reserved, red for leased
        const color = isSelected ? "#3b82f6" : plot.status === "available" ? "#22c55e" : plot.status === "reserved" ? "#f97316" : "#ef4444";
        const ring = plot.boundaryGeoJson?.coordinates?.[0];

        const shape =
          ring && ring.length >= 3
            ? L.polygon(
                ring.map(([lng, lat]) => [lat, lng] as [number, number]),
                { color, weight: isSelected ? 3 : 2, fillOpacity: isSelected ? 0.4 : 0.2 },
              )
            : L.circleMarker([plot.centroidLat, plot.centroidLng], {
                radius: isSelected ? 9 : 7,
                color,
                weight: 2,
                fillOpacity: isSelected ? 0.6 : 0.3,
              });

        shape
          .addTo(map)
          .bindTooltip(
            `${t.pages.leaseSettlement.dagNo}: ${plot.dagNo} (${plot.mouza}) - ${plot.areaDecimals} ${t.pages.leaseSettlement.decimals}`,
          )
          .on("click", () => {
            if (onSelect && plot.status === "available") {
              onSelect(plot);
            }
          });

        bounds.extend(
          "getBounds" in shape ? shape.getBounds() : [plot.centroidLat, plot.centroidLng],
        );
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
      } else {
        map.setView([23.685, 90.356], 7); // Default to Bangladesh
      }
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [plots, selectedId, onSelect, t]);

  return <div ref={containerRef} className={cn("z-0 h-72 w-full rounded-lg", className)} />;
}

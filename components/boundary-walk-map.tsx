"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LocalGpsPoint } from "@/lib/field-offline/types";
import type { Parcel } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";

export function BoundaryWalkMap({
  parcel,
  points,
}: {
  parcel: Parcel | null;
  points: LocalGpsPoint[];
}) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || (!parcel && points.length === 0)) return;
    let cancelled = false;
    let map: LeafletMap | undefined;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const bounds = L.latLngBounds([]);
      const ring = parcel?.boundary?.coordinates?.[0];
      if (ring && ring.length >= 3) {
        const reference = ring.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
        L.polygon(reference, { color: "#3f6212", weight: 2, fillOpacity: 0.08 }).addTo(map);
        reference.forEach((coordinate) => bounds.extend(coordinate));
      } else if (parcel) {
        bounds.extend([parcel.centroid.lat, parcel.centroid.lng]);
      }
      const track = points.map(
        (point) => [point.latitude, point.longitude] as [number, number],
      );
      if (track.length) {
        L.polyline(track, { color: "#c2410c", weight: 4, opacity: 0.9 }).addTo(map);
        track.forEach((coordinate) => bounds.extend(coordinate));
        const current = points.at(-1)!;
        L.circle([current.latitude, current.longitude], {
          radius: current.accuracyMeters,
          color: "#c2410c",
          weight: 1,
          fillOpacity: 0.08,
        }).addTo(map);
        L.circleMarker([current.latitude, current.longitude], {
          radius: 6,
          color: "#c2410c",
          weight: 2,
          fillOpacity: 0.8,
        }).addTo(map);
      }
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 18 });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [parcel, points]);

  return (
    <div
      ref={container}
      className="z-0 h-56 w-full rounded-lg"
      aria-label={t.common.gpsBoundaryTrack}
    />
  );
}

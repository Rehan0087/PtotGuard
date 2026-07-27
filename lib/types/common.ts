/**
 * Shared primitives used across the PlotGuard domain model.
 * Both the mock layer and the real API conform to these shapes.
 */

export type ID = string;

/** ISO-8601 timestamp, e.g. "2026-07-23T10:00:00Z". Kept as string for JSON parity. */
export type ISODateString = string;

// Bangladesh land measures: decimal (shotangsho) and katha alongside acre/bigha.
export type AreaUnit = "decimal" | "katha" | "bigha" | "acre" | "sqm" | "sqft";

export interface Area {
  value: number;
  unit: AreaUnit;
}

export type CurrencyCode = "BDT" | "USD";

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

/** A single point. Order is {lat, lng} for UI ergonomics (GeoJSON uses [lng, lat]). */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** GeoJSON-style polygon: array of linear rings, each ring an array of [lng, lat]. */
export interface GeoPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}

/**
 * Presentation-level grouping for record states. Every domain status
 * (dispute, mutation, document, parcel, …) maps to one of these tones,
 * which drives StatusBadge colors. See lib/status.ts.
 */
export type StatusTone =
  | "verified"
  | "pending"
  | "flagged"
  | "disputed"
  | "review"
  | "draft"
  | "neutral";

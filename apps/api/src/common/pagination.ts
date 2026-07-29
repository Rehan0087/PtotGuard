// From the package root, not the `/types` subpath: the API compiles with
// classic node resolution, which reads `main`/`types` and not `exports`.
import type { Paginated } from "@plotguard/rules";

export const DEFAULT_PAGE_SIZE = 20;
/** A page nobody asked for. Guards against `?pageSize=100000` as a cheap DoS. */
export const MAX_PAGE_SIZE = 200;

export interface PageParams {
  page: number;
  pageSize: number;
  /** Rows to skip — what an ORM wants. */
  skip: number;
  /** Rows to fetch — what an ORM wants. */
  take: number;
}

/**
 * Read `?page` / `?pageSize` the way the mock does: 1-based, clamped low, with
 * garbage falling back to the default rather than 400ing. The frontend builds
 * these with `qs()` and never sends a malformed one, but a hand-rolled request
 * should get a page rather than an error it cannot act on.
 */
export function pageParams(query: Record<string, unknown>): PageParams {
  const page = Math.max(1, toInt(query.page, 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(query.pageSize, DEFAULT_PAGE_SIZE)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function toInt(value: unknown, fallback: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * The list envelope every collection endpoint returns. `total` is the count
 * before paging — the client renders "showing 20 of 137" from it.
 */
export function paginated<T>(items: T[], total: number, params: PageParams): Paginated<T> {
  return { items, total, page: params.page, pageSize: params.pageSize };
}

/** In-memory paging, for endpoints not yet backed by a query. */
export function paginate<T>(all: T[], params: PageParams): Paginated<T> {
  return paginated(all.slice(params.skip, params.skip + params.take), all.length, params);
}

import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageParams, paginate } from "./pagination";

/**
 * Pinned against the mock's `paginate()` so a list endpoint returns the same
 * envelope and the same page for the same query.
 */
describe("pageParams", () => {
  it("defaults to the first page of twenty", () => {
    expect(pageParams({})).toMatchObject({ page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0 });
  });

  it("is 1-based, so page 2 skips the first page", () => {
    expect(pageParams({ page: "2", pageSize: "20" }).skip).toBe(20);
  });

  it("clamps a nonsensical page up to the first", () => {
    expect(pageParams({ page: "0" }).page).toBe(1);
    expect(pageParams({ page: "-5" }).page).toBe(1);
  });

  it("falls back to defaults rather than erroring on garbage", () => {
    // A hand-rolled request should still get a page it can act on.
    expect(pageParams({ page: "abc", pageSize: "xyz" })).toMatchObject({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it("caps the page size, so one request cannot ask for the whole table", () => {
    expect(pageParams({ pageSize: "100000" }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("takes the first value when a param is repeated", () => {
    expect(pageParams({ page: ["3", "9"] }).page).toBe(3);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 25 }, (_, i) => i + 1);

  it("returns the slice plus the count before paging", () => {
    // `total` is what the client renders "showing 10 of 25" from, so it must
    // count the whole result set, not the page.
    const page = paginate(rows, pageParams({ page: "1", pageSize: "10" }));

    expect(page).toEqual({ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], page: 1, pageSize: 10, total: 25 });
  });

  it("returns a short last page rather than padding it", () => {
    expect(paginate(rows, pageParams({ page: "3", pageSize: "10" })).items).toEqual([21, 22, 23, 24, 25]);
  });

  it("returns an empty page past the end, still reporting the total", () => {
    const page = paginate(rows, pageParams({ page: "99", pageSize: "10" }));

    expect(page.items).toEqual([]);
    expect(page.total).toBe(25);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import * as fieldSearch from "./field-search.ts";
import * as nav from "./nav.ts";

const reports = [
  {
    id: "report-1",
    parcelDagNo: "CS-142/3",
    purpose: "boundary-survey",
    status: "accepted",
    addressHint: "Rajamehar, Debidwar",
  },
  {
    id: "report-2",
    parcelDagNo: "RS-88",
    purpose: "measurement",
    status: "completed",
    addressHint: "Debidwar Road",
  },
  {
    id: "report-3",
    parcelDagNo: "BS-205",
    purpose: "possession-verify",
    status: "assigned",
    addressHint: "Canal side",
  },
];

test("the topbar sends field agents to their own search route", () => {
  assert.equal(nav.searchHrefForRole("field-agent"), "/field/search");
  assert.equal(nav.searchHrefForRole("citizen"), "/search");
  assert.equal(nav.searchHrefForRole("land-office"), "/search");
});

test("assigned reports can be searched by dag, purpose, or address", () => {
  assert.deepEqual(
    fieldSearch.filterAssignedFieldReports(reports, "cs-142", "all").map(({ id }) => id),
    ["report-1"],
  );
  assert.deepEqual(
    fieldSearch.filterAssignedFieldReports(reports, "measurement", "all").map(({ id }) => id),
    ["report-2"],
  );
  assert.deepEqual(
    fieldSearch.filterAssignedFieldReports(reports, "rajamehar", "all").map(({ id }) => id),
    ["report-1"],
  );
  assert.deepEqual(
    fieldSearch
      .filterAssignedFieldReports(reports, "সীমানা জরিপ", "all", {
        "boundary-survey": "সীমানা জরিপ",
      })
      .map(({ id }) => id),
    ["report-1"],
  );
});

test("status and text filters compose without changing the source order", () => {
  assert.deepEqual(
    fieldSearch.filterAssignedFieldReports(reports, "debIdWar", "completed").map(
      ({ id }) => id,
    ),
    ["report-2"],
  );
  assert.deepEqual(
    fieldSearch.filterAssignedFieldReports(reports, "", "all").map(({ id }) => id),
    ["report-1", "report-2", "report-3"],
  );
});

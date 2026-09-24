import assert from "node:assert/strict";
import test from "node:test";
import { NAV } from "../../lib/nav.ts";
import { LAND_OFFICER_RESPONSIBILITIES } from "../../lib/land-officer-responsibilities.ts";

test("land-office sidebar excludes complaints and grievances", () => {
  const items = NAV["land-office"].items;

  assert.deepEqual(
    items.map((item) => ({ labelKey: item.labelKey, href: item.href })),
    [
      { labelKey: "dashboard", href: "/dashboard" },
      { labelKey: "profile", href: "/profile" },
      {
        labelKey: "landOfficerResponsibilities",
        href: "/land-officer-responsibilities",
      },
    ],
  );
  assert.equal(items.some((item) => "children" in item), false);
});

test("citizen sidebar exposes complaints and grievances as a direct destination", () => {
  const items = NAV.citizen.items;

  assert.equal(
    items.some((item) => item.labelKey === "grievances" && item.href === "/grievances"),
    true,
  );
});

test("responsibilities page keeps every former land-office feature", () => {
  assert.deepEqual(
    LAND_OFFICER_RESPONSIBILITIES.map((service) => service.href),
    [
      "/records",
      "/mutations",
      "/disputes",
      "/land-tax",
      "/revenue-cases",
      "/lease-settlement",
      "/acquisition",
      "/appointments",
      "/ocr-queue",
      "/fraud-review",
      "/agents",
    ],
  );
});

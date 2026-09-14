import assert from "node:assert/strict";
import test from "node:test";
import { NAV } from "../../lib/nav.ts";
import { LAND_OFFICER_RESPONSIBILITIES } from "../../lib/land-officer-responsibilities.ts";

test("land-office sidebar has three flat destination links", () => {
  const items = NAV["land-office"].items;

  assert.deepEqual(
    items.map((item) => ({ labelKey: item.labelKey, href: item.href })),
    [
      { labelKey: "dashboard", href: "/records" },
      { labelKey: "profile", href: "/profile" },
      {
        labelKey: "landOfficerResponsibilities",
        href: "/land-officer-responsibilities",
      },
    ],
  );
  assert.equal(items.some((item) => "children" in item), false);
});

test("responsibilities page keeps every former land-office feature", () => {
  assert.deepEqual(
    LAND_OFFICER_RESPONSIBILITIES.map((service) => service.href),
    [
      "/records",
      "/mutations",
      "/land-admin",
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

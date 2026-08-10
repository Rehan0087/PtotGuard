import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  LayoutGrid,
  Search,
  FileText,
  Scale,
  GitBranch,
  BookMarked,
  ScanLine,
  ShieldAlert,
  Users2,
  MapPin,
  Gavel,
  UserCog,
  Building2,
  SlidersHorizontal,
  ShieldCheck,
  Banknote,
} from "lucide-react";
import type { Role } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n";

/**
 * Nav carries dictionary keys, not words: the route, icon, and ordering are the
 * same in every language, so only the label is looked up (`t.nav[item.labelKey]`).
 */
export type NavLabelKey = keyof Omit<Dictionary["nav"], "portals" | "groups">;
export type PortalKey = keyof Dictionary["nav"]["portals"];
export type NavGroupKey = keyof Dictionary["nav"]["groups"];

export interface NavItem {
  labelKey: NavLabelKey;
  href: string;
  icon: LucideIcon;
  /**
   * Sidebar heading this item sits under. Portals with a handful of items
   * leave it off and render as one flat list; the citizen portal has enough
   * surface to need grouping (ILRDMS Level 2).
   */
  group?: NavGroupKey;
}

export interface PortalNav {
  /** Shown as the sidebar section eyebrow. */
  portalKey: PortalKey;
  /** Landing route for the role. */
  home: string;
  items: NavItem[];
}

/** Render order for grouped portals. Items keep their own order within a group. */
export const NAV_GROUP_ORDER: NavGroupKey[] = ["myLand", "services", "tools"];

export const NAV: Record<Role, PortalNav> = {
  // ILRDMS two-level structure: `/portal` is Level 1 (the service grid) and is
  // the landing route; this grouped list is Level 2. Only built routes appear —
  // a service joins `services` when its screen lands, not before, so the
  // sidebar never offers a link that 404s. The full eight-service picture,
  // including what is not built yet, is on `/portal`.
  citizen: {
    portalKey: "citizen",
    home: "/portal",
    items: [
      { labelKey: "portal", href: "/portal", icon: LayoutGrid, group: "myLand" },
      { labelKey: "dashboard", href: "/dashboard", icon: LayoutDashboard, group: "myLand" },
      { labelKey: "myProperties", href: "/properties", icon: MapPin, group: "myLand" },
      { labelKey: "searchRecords", href: "/search", icon: Search, group: "myLand" },
      { labelKey: "mutations", href: "/mutations", icon: GitBranch, group: "services" },
      { labelKey: "landTax", href: "/land-tax", icon: Banknote, group: "services" },
      { labelKey: "inheritance", href: "/inheritance", icon: GitBranch, group: "tools" },
      { labelKey: "myDocuments", href: "/documents", icon: FileText, group: "tools" },
      { labelKey: "disputes", href: "/disputes", icon: Scale, group: "tools" },
    ],
  },
  "land-office": {
    portalKey: "landOffice",
    home: "/records",
    items: [
      { labelKey: "records", href: "/records", icon: BookMarked },
      { labelKey: "mutations", href: "/mutations", icon: GitBranch },
      { labelKey: "ocrQueue", href: "/ocr-queue", icon: ScanLine },
      { labelKey: "fraudReview", href: "/fraud-review", icon: ShieldAlert },
      { labelKey: "fieldAgents", href: "/agents", icon: Users2 },
    ],
  },
  "field-agent": {
    portalKey: "fieldSurvey",
    home: "/visits",
    items: [{ labelKey: "assignedVisits", href: "/visits", icon: MapPin }],
  },
  mediator: {
    portalKey: "mediation",
    home: "/cases",
    items: [{ labelKey: "cases", href: "/cases", icon: Gavel }],
  },
  admin: {
    portalKey: "administration",
    home: "/users",
    items: [
      { labelKey: "users", href: "/users", icon: UserCog },
      { labelKey: "auditLedger", href: "/audit", icon: ShieldCheck },
      { labelKey: "jurisdictions", href: "/jurisdictions", icon: Building2 },
      { labelKey: "policies", href: "/policies", icon: SlidersHorizontal },
    ],
  },
};

export const roleHome = (role: Role): string => NAV[role].home;

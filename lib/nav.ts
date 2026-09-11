import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  LayoutGrid,
  MapPin,
  Gavel,
  UserCog,
  Building2,
  SlidersHorizontal,
  ShieldCheck,
  HelpCircle,
  BookOpen,
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
   * leave it off and render as one flat list.
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
      { labelKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      { labelKey: "profile", href: "/profile", icon: UserCog },
      { labelKey: "citizenServices", href: "/portal", icon: LayoutGrid },
      { labelKey: "faq", href: "/faq", icon: HelpCircle },
      { labelKey: "manual", href: "/support", icon: BookOpen },
    ],
  },
  "land-office": {
    portalKey: "landOffice",
    home: "/records",
    items: [
      { labelKey: "dashboard", href: "/records", icon: LayoutDashboard },
      { labelKey: "profile", href: "/profile", icon: UserCog },
      {
        labelKey: "landOfficerResponsibilities",
        href: "/land-officer-responsibilities",
        icon: LayoutGrid,
      },
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

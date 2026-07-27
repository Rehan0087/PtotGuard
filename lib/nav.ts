import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
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
} from "lucide-react";
import type { Role } from "@/lib/types";
import type { Dictionary } from "@/lib/i18n";

/**
 * Nav carries dictionary keys, not words: the route, icon, and ordering are the
 * same in every language, so only the label is looked up (`t.nav[item.labelKey]`).
 */
export type NavLabelKey = keyof Omit<Dictionary["nav"], "portals">;
export type PortalKey = keyof Dictionary["nav"]["portals"];

export interface NavItem {
  labelKey: NavLabelKey;
  href: string;
  icon: LucideIcon;
}

export interface PortalNav {
  /** Shown as the sidebar section eyebrow. */
  portalKey: PortalKey;
  /** Landing route for the role. */
  home: string;
  items: NavItem[];
}

export const NAV: Record<Role, PortalNav> = {
  citizen: {
    portalKey: "citizen",
    home: "/dashboard",
    items: [
      { labelKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      { labelKey: "searchRecords", href: "/search", icon: Search },
      { labelKey: "myDocuments", href: "/documents", icon: FileText },
      { labelKey: "disputes", href: "/disputes", icon: Scale },
      { labelKey: "inheritance", href: "/inheritance", icon: GitBranch },
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

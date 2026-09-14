import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  Building2,
  CalendarClock,
  GitBranch,
  Landmark,
  Scale,
  ScanLine,
  ShieldAlert,
  Sprout,
  Users2,
} from "lucide-react";
import type { NavLabelKey } from "@/lib/nav";

export interface LandOfficerResponsibility {
  navKey: NavLabelKey;
  icon: LucideIcon;
  href: string;
  iconColor: string;
}

export const LAND_OFFICER_RESPONSIBILITIES: readonly LandOfficerResponsibility[] = [
  {
    navKey: "records",
    icon: BookMarked,
    href: "/records",
    iconColor: "text-teal-500 border-teal-500",
  },
  {
    navKey: "mutations",
    icon: GitBranch,
    href: "/mutations",
    iconColor: "text-orange-500 border-orange-500",
  },
  {
    navKey: "landAdmin",
    icon: Building2,
    href: "/land-admin",
    iconColor: "text-slate-600 border-slate-600",
  },
  {
    navKey: "revenueCases",
    icon: Scale,
    href: "/revenue-cases",
    iconColor: "text-amber-600 border-amber-600",
  },
  {
    navKey: "leaseSettlement",
    icon: Sprout,
    href: "/lease-settlement",
    iconColor: "text-green-500 border-green-500",
  },
  {
    navKey: "acquisition",
    icon: Landmark,
    href: "/acquisition",
    iconColor: "text-pink-600 border-pink-600",
  },
  {
    navKey: "appointments",
    icon: CalendarClock,
    href: "/appointments",
    iconColor: "text-cyan-600 border-cyan-600",
  },
  {
    navKey: "ocrQueue",
    icon: ScanLine,
    href: "/ocr-queue",
    iconColor: "text-sky-500 border-sky-500",
  },
  {
    navKey: "fraudReview",
    icon: ShieldAlert,
    href: "/fraud-review",
    iconColor: "text-red-500 border-red-500",
  },
  {
    navKey: "fieldAgents",
    icon: Users2,
    href: "/agents",
    iconColor: "text-indigo-500 border-indigo-500",
  },
];

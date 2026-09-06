"use client";

import Link from "next/link";
import {
  MapPin,
  ScanFace,
  Coins,
  Home,
  Landmark,
  Sprout,
  Building2,
  Scale,
  FileStack,
  FileText,
  CalendarClock,
  Receipt,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

type Service = {
  navKey: keyof typeof import("@/lib/i18n/dictionaries/en").en.nav;
  icon: any;
  href: string;
  iconColor: string;
};

const SERVICES: Service[] = [
  { navKey: "mutations", icon: ScanFace, href: "/mutations", iconColor: "text-teal-500 border-teal-500" },
  { navKey: "landTax", icon: Coins, href: "/land-tax", iconColor: "text-orange-500 border-orange-500" },
  { navKey: "searchRecords", icon: Home, href: "/search", iconColor: "text-lime-600 border-lime-600" },
  { navKey: "acquisition", icon: Landmark, href: "/acquisition", iconColor: "text-pink-600 border-pink-600" },
  { navKey: "myProperties", icon: MapPin, href: "/properties", iconColor: "text-blue-500 border-blue-500" },
  { navKey: "leaseSettlement", icon: Sprout, href: "/lease-settlement", iconColor: "text-green-500 border-green-500" },
  { navKey: "landAdmin", icon: Building2, href: "/land-admin", iconColor: "text-slate-600 border-slate-600" },
  { navKey: "revenueCases", icon: Scale, href: "/revenue-cases", iconColor: "text-amber-600 border-amber-600" },
  { navKey: "infoBank", icon: FileStack, href: "/land-info-bank", iconColor: "text-indigo-500 border-indigo-500" },
  { navKey: "inheritance", icon: GitBranch, href: "/inheritance", iconColor: "text-purple-500 border-purple-500" },
  { navKey: "myDocuments", icon: FileText, href: "/documents", iconColor: "text-sky-500 border-sky-500" },
  { navKey: "disputes", icon: Scale, href: "/disputes", iconColor: "text-red-500 border-red-500" },
  { navKey: "appointments", icon: CalendarClock, href: "/appointments", iconColor: "text-cyan-600 border-cyan-600" },
  { navKey: "payments", icon: Receipt, href: "/payments", iconColor: "text-emerald-500 border-emerald-500" },
];

export default function PortalPage() {
  const t = useT();

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm">
        <h1 className="text-xl font-medium text-slate-800">{t.nav.citizenServices}</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          const title = t.nav[service.navKey] as string;
          return (
            <Link key={service.navKey} href={service.href} className="block focus-visible:outline-none">
              <div className="bg-white rounded-md border border-slate-200 p-8 flex flex-col items-center justify-center text-center transition-all hover:shadow-md hover:-translate-y-1 h-[220px]">
                <div className={cn("w-16 h-16 rounded-md border-2 flex items-center justify-center mb-6", service.iconColor)}>
                  <Icon className="w-8 h-8" strokeWidth={2} />
                </div>
                <h3 className="text-slate-800 font-medium">{title}</h3>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Pagination Dots */}
      <div className="flex items-center justify-center gap-2 pt-4">
        <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
        <div className="w-2.5 h-2.5 rounded-full bg-slate-200"></div>
        <div className="w-2.5 h-2.5 rounded-full bg-slate-200"></div>
      </div>
    </div>
  );
}

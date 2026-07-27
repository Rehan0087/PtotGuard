"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { NavItem } from "@/lib/nav";

export function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="grid gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-primary"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            {active ? (
              <span
                className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary"
                aria-hidden
              />
            ) : null}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active
                  ? "text-sidebar-primary"
                  : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground",
              )}
            />
            {t.nav[item.labelKey]}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { NAV_GROUP_ORDER, type NavItem } from "@/lib/nav";

export function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useT();

  // A portal is grouped only if its items say so. Ungrouped portals (every
  // role but citizen today) render exactly as before — one flat list, no
  // headings, no empty group shells.
  const groups = NAV_GROUP_ORDER.map((key) => ({
    key,
    items: items.filter((i) => i.group === key),
  })).filter((g) => g.items.length > 0);

  const ungrouped = items.filter((i) => !i.group);

  if (groups.length === 0) {
    return <NavList items={ungrouped} pathname={pathname} onNavigate={onNavigate} />;
  }

  return (
    <div className="grid gap-4">
      {ungrouped.length > 0 ? (
        <NavList items={ungrouped} pathname={pathname} onNavigate={onNavigate} />
      ) : null}
      {groups.map((group) => (
        <div key={group.key} className="grid gap-0.5">
          <div className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/40">
            {t.nav.groups[group.key]}
          </div>
          <NavList items={group.items} pathname={pathname} onNavigate={onNavigate} />
        </div>
      ))}
    </div>
  );
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
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

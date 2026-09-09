"use client";

import { useSessionStore } from "@/store/session";
import { NAV } from "@/lib/nav";
import { initials } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useSession } from "@/hooks/queries";
import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const role = useSessionStore((s) => s.role);
  const portal = NAV[role];
  const { data } = useSession();
  const user = data?.user;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="cadastral-grid cadastral-grid-light border-b border-sidebar-border px-4 py-4">
        <Logo />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/45">
          {t.nav.portals[portal.portalKey]}
        </div>
        <SidebarNav items={portal.items} onNavigate={onNavigate} />
      </div>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1">
          <Avatar size="sm">
            <AvatarFallback className="bg-sidebar-accent text-xs font-medium text-sidebar-foreground">
              {user ? initials(user.name) : "—"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-sidebar-foreground">
              {user?.name ?? "…"}
            </div>
            <div className="truncate text-xs text-sidebar-foreground/55">
              {user?.title ?? (user ? t.roles[user.role] : "")}
            </div>
          </div>
        </div>
      </div>

      {role === "citizen" && (
        <div className="px-4 pb-4">
          <div className="rounded-full border border-primary text-primary px-3 py-1.5 text-xs font-medium inline-block mb-4">
            Profile Verified By
          </div>
          <div className="space-y-2.5 text-xs text-sidebar-foreground">
            <div className="flex items-center justify-between">
              <span>Phone Number</span>
              <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex items-center justify-between">
              <span>Email</span>
            </div>
            <div className="flex items-center justify-between">
              <span>National ID</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Birth Certificate</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

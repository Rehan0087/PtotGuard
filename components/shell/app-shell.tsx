"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { useRole } from "@/hooks/queries";
import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AssistantChatWidget } from "@/components/assistant/chat-widget";

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const role = useRole();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-svh lg:block">
        <AppSidebar />
      </aside>

      <div className="app-canvas flex min-h-svh min-w-0 flex-col">
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 cadastral-grid">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">{t.shell.navigation}</SheetTitle>
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {role === "citizen" && <AssistantChatWidget />}
    </div>
  );
}

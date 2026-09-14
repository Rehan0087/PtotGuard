"use client";

import Link from "next/link";
import { Menu, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/hooks/queries";
import { useT } from "@/lib/i18n/provider";
import { IdChip } from "@/components/id-chip";
import { JurisdictionName } from "@/components/jurisdiction-name";
import { LanguageToggle } from "./language-toggle";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu } from "./user-menu";

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const t = useT();
  const { data } = useSession();
  const jurisdiction = data?.jurisdiction;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-primary/15 bg-background/85 px-3 shadow-[0_1px_0_color-mix(in_oklab,var(--marker)_25%,transparent)] backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        aria-label={t.shell.openNavigation}
        onClick={onOpenMobileNav}
      >
        <Menu className="size-4" />
      </Button>

      {jurisdiction ? (
        <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
          <MapPin className="size-4 text-marker" />
          <JurisdictionName jurisdiction={jurisdiction} className="text-foreground/80" />
          <IdChip>{jurisdiction.code}</IdChip>
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        <Link
          href="/search"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "hidden text-muted-foreground sm:inline-flex",
          )}
        >
          <Search className="size-3.5" />
          {t.shell.searchRecords}
        </Link>
        <LanguageToggle />
        <ThemeToggle />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}

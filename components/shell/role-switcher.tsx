"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session";
import { ROLES, type Role } from "@/lib/types";
import { roleHome } from "@/lib/nav";
import { useT } from "@/lib/i18n/provider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * Dev-only affordance: preview any of the five portals without real auth.
 * Switching the role updates the api-client header (so data re-scopes) and
 * navigates to that role's landing page. Replace with real auth later.
 */
export function RoleSwitcher() {
  const t = useT();
  const router = useRouter();
  const role = useSessionStore((s) => s.role);
  const setRole = useSessionStore((s) => s.setRole);

  function onChange(next: string) {
    const nextRole = next as Role;
    setRole(nextRole);
    router.push(roleHome(nextRole));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <span className="size-1.5 rounded-full bg-marker" aria-hidden />
        <span className="hidden text-muted-foreground sm:inline">{t.shell.previewAs}</span>
        <span className="font-medium text-foreground">{t.roles[role]}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="flex items-center justify-between px-1.5 py-1 text-xs font-medium text-muted-foreground">
          <span>{t.shell.previewAsRole}</span>
          <span className="rounded bg-marker/15 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-marker">
            {t.shell.dev}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={role} onValueChange={onChange}>
          {ROLES.map((r) => (
            <DropdownMenuRadioItem key={r} value={r}>
              {t.roles[r]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

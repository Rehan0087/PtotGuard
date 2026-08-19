"use client";

import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/hooks/queries";
import { initials } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { useSessionStore } from "@/store/session";

export function UserMenu() {
  const t = useT();
  const router = useRouter();
  const logout = useSessionStore((s) => s.logout);
  const { data } = useSession();
  const user = data?.user;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t.shell.accountMenu}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "rounded-full")}
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
            {user ? initials(user.name) : <UserRound className="size-3.5" />}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-1.5 py-1.5">
          <div className="text-sm font-medium text-foreground">{user?.name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">
            {user?.title ?? (user ? t.roles[user.role] : "")}
          </div>
          {user?.email ? (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</div>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            logout();
            router.push("/login");
          }}
        >
          <LogOut className="size-4" />
          {t.shell.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

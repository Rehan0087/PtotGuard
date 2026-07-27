"use client";

import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/hooks/queries";
import { useFmt } from "@/lib/i18n/format";
import { useNotificationText } from "@/lib/i18n/content";
import { useT } from "@/lib/i18n/provider";
import type { NotificationSeverity } from "@/lib/types";

const severityDot: Record<NotificationSeverity, string> = {
  info: "bg-review",
  success: "bg-verified",
  warning: "bg-pending",
  critical: "bg-flagged",
};

export function NotificationsMenu() {
  const t = useT();
  const f = useFmt();
  const text = useNotificationText();
  const router = useRouter();
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t.shell.notificationsAria(unread)}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "relative")}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-marker text-[10px] font-semibold text-marker-foreground tabular-nums">
            {unread > 9 ? `${f.number(9)}+` : f.number(unread)}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">{t.shell.notifications}</span>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => markAll.mutate()}
              className="text-muted-foreground"
            >
              <CheckCheck className="size-3.5" />
              {t.shell.markAllRead}
            </Button>
          ) : null}
        </div>
        <div className="max-h-[22rem] overflow-y-auto py-1">
          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t.shell.allCaughtUp}
            </p>
          ) : (
            notifications.map((n) => {
              const { title, body } = text(n);
              return (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  if (n.href) router.push(n.href);
                }}
                className={cn(
                  "flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted",
                  !n.read && "bg-secondary/40",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : severityDot[n.severity],
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{f.fromNow(n.at)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                    {body}
                  </span>
                </span>
              </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

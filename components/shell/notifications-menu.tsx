"use client";

import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Info, CheckCircle2, AlertTriangle, AlertOctagon, X } from "lucide-react";
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
import type { AppNotification, NotificationSeverity } from "@/lib/types";
import { parseISO, isToday, isThisWeek } from "date-fns";
import React from "react";

const SeverityIcon: Record<NotificationSeverity, React.ElementType> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

const SeverityColor: Record<NotificationSeverity, string> = {
  info: "text-blue-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  critical: "text-red-500",
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

  const today: AppNotification[] = [];
  const thisWeek: AppNotification[] = [];
  const earlier: AppNotification[] = [];

  notifications.forEach((n) => {
    const d = parseISO(n.at);
    if (isToday(d)) {
      today.push(n);
    } else if (isThisWeek(d)) {
      thisWeek.push(n);
    } else {
      earlier.push(n);
    }
  });

  const renderGroup = (label: string, items: AppNotification[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-2">
        <div className="sticky top-0 z-10 bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          {label}
        </div>
        {items.map((n) => {
          const { title, body } = text(n);
          const Icon = SeverityIcon[n.severity];
          return (
            <div
              key={n.id}
              className={cn(
                "group relative flex w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-muted",
                !n.read && "bg-secondary/40",
              )}
            >
              <div className="mt-0.5 shrink-0">
                <Icon className={cn("size-4", SeverityColor[n.severity])} />
              </div>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  if (n.href) router.push(n.href);
                }}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm font-medium", !n.read ? "text-foreground" : "text-muted-foreground")}>{title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{f.fromNow(n.at)}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                  {body}
                </span>
              </button>
              {!n.read && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    markRead.mutate(n.id);
                  }}
                  className="absolute right-2 top-2 hidden size-6 shrink-0 opacity-50 hover:opacity-100 group-hover:flex"
                  aria-label="Mark as read"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

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
      <DropdownMenuContent align="end" className="w-[24rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">
            {t.shell.notifications} {unread > 0 && <span className="ml-1 text-muted-foreground">({f.number(unread)})</span>}
          </span>
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
        <div className="max-h-[26rem] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t.shell.allCaughtUp}
            </p>
          ) : (
            <div className="py-1">
              {renderGroup("Today", today)}
              {renderGroup("This Week", thisWeek)}
              {renderGroup("Earlier", earlier)}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

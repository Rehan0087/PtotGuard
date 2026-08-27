"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusMetaBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUsers, useJurisdictions, useUpdateUser, useSession } from "@/hooks/queries";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { useJurisdictionName } from "@/components/jurisdiction-name";
import { ROLES, type Jurisdiction, type Role, type User } from "@/lib/types";
import { initials } from "@/lib/format";

const selectClass =
  "h-7 max-w-[11rem] rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function UserRow({
  user,
  jurisdictions,
  jName,
  isSelf,
}: {
  user: User;
  jurisdictions: Jurisdiction[];
  jName: (id: string) => string;
  isSelf: boolean;
}) {
  const dict = useT();
  const t = dict.pages.users;
  const s = useStatusMeta();
  const update = useUpdateUser(user.id);
  const [confirming, setConfirming] = useState(false);
  const selfSuspendBlocked = isSelf && user.status === "active";

  function onError() {
    toast.error(t.failedTitle, {
      description: update.error?.message ?? t.failedTitle,
    });
  }

  function toggleStatus() {
    const next = user.status === "suspended" ? "active" : "suspended";
    update.mutate(
      { status: next },
      {
        onSuccess: () => {
          setConfirming(false);
          toast.success(t.updatedTitle, {
            description:
              next === "suspended" ? t.suspendedBody(user.name) : t.reactivatedBody(user.name),
          });
        },
        onError,
      },
    );
  }

  function changeJurisdiction(jurisdictionId: string) {
    if (jurisdictionId === user.jurisdictionId) return;
    update.mutate(
      { jurisdictionId },
      {
        onSuccess: () =>
          toast.success(t.updatedTitle, { description: t.jurisdictionUpdatedBody(user.name) }),
        onError,
      },
    );
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Avatar size="sm">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-medium text-foreground">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {user.title ?? user.email}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {/* Role reassignment isn't offered here — see UsersController's own
            note on why account creation and role changes stay out. */}
        {dict.roles[user.role]}
      </TableCell>
      <TableCell>
        <select
          className={selectClass}
          value={user.jurisdictionId}
          disabled={update.isPending}
          onChange={(e) => changeJurisdiction(e.target.value)}
        >
          {jurisdictions.map((j) => (
            <option key={j.id} value={j.id}>
              {jName(j.id)}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <StatusMetaBadge meta={s.user[user.status]} />
      </TableCell>
      <TableCell>
        {confirming ? (
          <div className="flex max-w-[16rem] flex-col items-start gap-1.5">
            <p className="text-pretty text-xs text-muted-foreground">
              {t.confirmSuspendBody(user.name)}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="destructive"
                disabled={update.isPending}
                onClick={toggleStatus}
              >
                {t.confirm}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => setConfirming(false)}
              >
                {dict.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="xs"
            variant={user.status === "suspended" ? "secondary" : "outline"}
            disabled={selfSuspendBlocked}
            title={selfSuspendBlocked ? t.cannotSuspendSelf : undefined}
            onClick={() =>
              user.status === "suspended" ? toggleStatus() : setConfirming(true)
            }
          >
            {user.status === "suspended" ? t.reactivate : t.suspend}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function UsersPage() {
  const t = useT();
  const jurisdictionName = useJurisdictionName();
  const { data: session } = useSession();
  const [role, setRole] = useState<"all" | Role>("all");

  const roleFilters: { value: "all" | Role; label: string }[] = [
    { value: "all", label: t.common.all },
    ...ROLES.map((r) => ({ value: r, label: t.roles[r] })),
  ];
  const { data, isLoading } = useUsers({ role: role === "all" ? undefined : role, pageSize: 100 });
  const { data: jurisdictions = [] } = useJurisdictions();
  const users = data?.items ?? [];

  const jName = (id: string) =>
    jurisdictionName(jurisdictions.find((j) => j.id === id)) || t.common.notAvailable;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.administration}
        title={t.nav.users}
        description={t.pages.users.description}
      />

      <div className="flex flex-wrap gap-1">
        {roleFilters.map((f) => (
          <Button
            key={f.value}
            variant={role === f.value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRole(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={UserRound}
            title={t.pages.users.emptyTitle}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{t.pages.users.colName}</TableHead>
                <TableHead>{t.pages.users.colRole}</TableHead>
                <TableHead>{t.pages.users.colJurisdiction}</TableHead>
                <TableHead>{t.pages.users.colStatus}</TableHead>
                <TableHead>{t.pages.users.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  jurisdictions={jurisdictions}
                  jName={jName}
                  isSelf={u.id === session?.user.id}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

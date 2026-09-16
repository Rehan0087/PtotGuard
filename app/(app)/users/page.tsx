"use client";

import { useState } from "react";
import { KeyRound, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusMetaBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useInviteUser,
  useJurisdictions,
  useResetUserPassword,
  useSession,
  useUpdateUser,
  useUsers,
} from "@/hooks/queries";
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
  onIssued,
}: {
  user: User;
  jurisdictions: Jurisdiction[];
  jName: (id: string) => string;
  isSelf: boolean;
  /** A password the administrator must read now; the page shows it once. */
  onIssued: (name: string, password: string) => void;
}) {
  const dict = useT();
  const t = dict.pages.users;
  const s = useStatusMeta();
  const update = useUpdateUser(user.id);
  const resetPassword = useResetUserPassword(user.id);
  const [confirming, setConfirming] = useState(false);
  const selfSuspendBlocked = isSelf && user.status === "active";
  // passwordResetGate()'s answer, shown before the endpoint has to give it.
  const resetBlocked = user.status === "invited";

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
      <TableCell>
        {/* Never your own: roleChangeGate() refuses it, because an admin who
            can demote themselves can lock the registry out of itself. */}
        <select
          className={selectClass}
          value={user.role}
          disabled={isSelf || update.isPending}
          title={isSelf ? t.cannotChangeOwnRole : undefined}
          onChange={(e) =>
            update.mutate(
              { role: e.target.value as Role },
              {
                onSuccess: () =>
                  toast.success(t.updatedTitle, { description: t.roleUpdatedBody(user.name) }),
                onError,
              },
            )
          }
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {dict.roles[r]}
            </option>
          ))}
        </select>
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
          <div className="flex items-center gap-1.5">
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
            <Button
              size="xs"
              variant="ghost"
              disabled={resetBlocked || resetPassword.isPending}
              title={resetBlocked ? t.cannotResetInvited : undefined}
              onClick={() =>
                resetPassword.mutate(undefined, {
                  onSuccess: (result) => onIssued(user.name, result.temporaryPassword),
                  onError: () => toast.error(t.failedTitle),
                })
              }
            >
              <KeyRound className="size-3.5" />
              {t.resetPassword}
            </Button>
          </div>
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

  const invite = useInviteUser();
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "citizen" as Role,
    jurisdictionId: "",
    title: "",
  });
  const u = t.pages.users;

  function submitInvite() {
    invite.mutate(
      {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        jurisdictionId: form.jurisdictionId || jurisdictions[0]?.id || "",
        ...(form.title.trim() ? { title: form.title.trim() } : {}),
      },
      {
        onSuccess: (result) => {
          setIssued({ name: result.user.name, password: result.temporaryPassword });
          setInviting(false);
          setForm({ name: "", email: "", role: "citizen", jurisdictionId: "", title: "" });
          toast.success(u.updatedTitle, { description: u.invitedBody(result.user.name) });
        },
        onError: () => toast.error(u.failedTitle),
      },
    );
  }

  const jName = (id: string) =>
    jurisdictionName(jurisdictions.find((j) => j.id === id)) || t.common.notAvailable;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.administration}
        title={t.nav.users}
        description={t.pages.users.description}
      >
        <Button onClick={() => setInviting((open) => !open)}>
          <UserPlus className="size-4" />
          {u.invite}
        </Button>
      </PageHeader>

      {/* Shown once, never again: the hash is all that is kept. */}
      {issued ? (
        <Card className="gap-2 border-marker/40 bg-marker/5 px-4 py-3">
          <h2 className="font-heading text-sm font-semibold text-foreground">
            {u.issuedTitle(issued.name)}
          </h2>
          <code className="tabular w-fit rounded-md bg-background px-2.5 py-1 text-base font-semibold text-foreground ring-1 ring-border">
            {issued.password}
          </code>
          <p className="text-xs text-muted-foreground">{u.issuedBody}</p>
          <Button size="sm" variant="outline" className="w-fit" onClick={() => setIssued(null)}>
            {u.issuedDone}
          </Button>
        </Card>
      ) : null}

      {inviting ? (
        <Card className="gap-3 px-4 py-4">
          <h2 className="font-heading text-sm font-semibold text-foreground">{u.inviteTitle}</h2>
          <p className="text-xs text-muted-foreground">{u.inviteBody}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-label={u.nameLabel}
              placeholder={u.nameLabel}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              aria-label={u.emailLabel}
              type="email"
              placeholder={u.emailLabel}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <select
              aria-label={u.roleLabel}
              className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.roles[r]}
                </option>
              ))}
            </select>
            <select
              aria-label={u.jurisdictionLabel}
              className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={form.jurisdictionId || jurisdictions[0]?.id || ""}
              onChange={(e) => setForm((f) => ({ ...f, jurisdictionId: e.target.value }))}
            >
              {jurisdictions.map((j) => (
                <option key={j.id} value={j.id}>
                  {jName(j.id)}
                </option>
              ))}
            </select>
            <Input
              aria-label={u.titleLabel}
              placeholder={u.titleLabel}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!form.name.trim() || !form.email.trim() || invite.isPending}
              onClick={submitInvite}
            >
              {u.createAccount}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setInviting(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </Card>
      ) : null}

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
                  onIssued={(name, password) => setIssued({ name, password })}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

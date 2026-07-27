"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
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
import { useUsers, useJurisdictions } from "@/hooks/queries";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { useJurisdictionName } from "@/components/jurisdiction-name";
import { ROLES, type Role } from "@/lib/types";
import { initials } from "@/lib/format";

export default function UsersPage() {
  const t = useT();
  const s = useStatusMeta();
  const jurisdictionName = useJurisdictionName();
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar size="sm">
                        <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                          {initials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{u.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {u.title ?? u.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.roles[u.role]}</TableCell>
                  <TableCell className="text-muted-foreground">{jName(u.jurisdictionId)}</TableCell>
                  <TableCell>
                    <StatusMetaBadge meta={s.user[u.status]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

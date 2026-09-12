"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { roleHome } from "@/lib/nav";
import { useSessionStore } from "@/store/session";

export function FieldAccessGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const role = useSessionStore((state) => state.role);
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const hasHydrated = useSessionStore((state) => state.hasHydrated);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || role === "field-agent") return;
    router.replace(roleHome(role));
  }, [hasHydrated, isAuthenticated, role, router]);

  if (!hasHydrated || !isAuthenticated || role !== "field-agent") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return children;
}

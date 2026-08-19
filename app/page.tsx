"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";
import { roleHome } from "@/lib/nav";

/** Sends a signed-in visitor to their active role's landing page, everyone else to /login. */
export default function RootRedirect() {
  const router = useRouter();
  const role = useSessionStore((s) => s.role);
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const hasHydrated = useSessionStore((s) => s.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    router.replace(isAuthenticated ? roleHome(role) : "/login");
  }, [role, isAuthenticated, hasHydrated, router]);

  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

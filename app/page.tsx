"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session";
import { roleHome } from "@/lib/nav";

/** Sends people to their active role's landing page. */
export default function RootRedirect() {
  const router = useRouter();
  const role = useSessionStore((s) => s.role);

  useEffect(() => {
    router.replace(roleHome(role));
  }, [role, router]);

  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { API_MOCKING } from "@/lib/api-client";

/**
 * Starts the worker at most once per page load.
 *
 * Memoized at module scope rather than guarded inside the effect: StrictMode
 * runs effects twice in dev, and `worker.start()` throws on an already-enabled
 * network. A per-mount flag can suppress the *setState* from a duplicate run
 * but not the duplicate call itself, so the promise is what has to be shared.
 */
let startPromise: Promise<unknown> | null = null;

function startWorker() {
  startPromise ??= import("@/lib/mocks/browser").then(({ worker }) =>
    worker.start({ onUnhandledRequest: "bypass", quiet: true }),
  );
  return startPromise;
}

/**
 * Boots the MSW worker in the browser before rendering the app, so no query
 * ever races ahead of the mock. When mocking is disabled, renders instantly.
 */
export function MswProvider({ children }: { children: React.ReactNode }) {
  // When mocking is off, we're ready immediately (no synchronous setState needed).
  const [ready, setReady] = useState(!API_MOCKING);

  useEffect(() => {
    if (!API_MOCKING) return;
    let active = true;
    startWorker()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((error) => {
        // Rendering the shell over a dead mock would surface as every screen
        // failing to load, which reads as an app bug rather than a boot one.
        console.error("MSW worker failed to start", error);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="text-sm">Preparing records…</p>
      </div>
    );
  }

  return <>{children}</>;
}

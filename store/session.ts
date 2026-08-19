"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/types";

/**
 * Client-only session state. `isAuthenticated` gates the app shell — false
 * until /login sets it. The "active role" it carries is still what every
 * request is scoped by (sent as a header; see api-client.ts), the same
 * stand-in as before login existed. When real auth lands, `login` becomes
 * where the server's session token gets stored instead of just a role.
 *
 * `hasHydrated` exists because persisted state loads from localStorage
 * *after* the first render, not before: on a hard refresh the store starts
 * at its default (signed out) and only flips to the real, persisted value a
 * tick later. A route guard that redirects on that first tick would bounce
 * an already-signed-in visitor back to /login on every reload. Callers that
 * gate on `isAuthenticated` must wait for `hasHydrated` first.
 */
interface SessionState {
  role: Role;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setRole: (role: Role) => void;
  login: (role: Role) => void;
  logout: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      role: "citizen",
      isAuthenticated: false,
      hasHydrated: false,
      setRole: (role) => set({ role }),
      login: (role) => set({ role, isAuthenticated: true }),
      logout: () => set({ isAuthenticated: false }),
    }),
    { name: "plotguard-session" },
  ),
);

// Flip the flag once localStorage has actually been read — covers both the
// normal case (hydration finishes after this module runs) and the raced one
// (it already finished, e.g. on a fast re-mount) so callers never wait forever.
// Guarded to the browser: there is no localStorage to hydrate from during
// Next's server render, and `.persist` isn't populated on that pass.
if (typeof window !== "undefined") {
  useSessionStore.persist.onFinishHydration(() => useSessionStore.setState({ hasHydrated: true }));
  if (useSessionStore.persist.hasHydrated()) {
    useSessionStore.setState({ hasHydrated: true });
  }
}

/** Read the active role outside React (used by the api-client). */
export const getActiveRole = (): Role => useSessionStore.getState().role;

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthTokens, Role, User } from "@/lib/types";

/**
 * Client-only session state. `isAuthenticated` gates the app shell — false
 * until /login stores the server response. The role and tokens always arrive
 * together, so the portal shell and API client use the same authenticated
 * identity.
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
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  login: (user: Pick<User, "role">, tokens: AuthTokens) => void;
  logout: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      role: "citizen",
      tokens: null,
      isAuthenticated: false,
      hasHydrated: false,
      login: (user, tokens) => set({ role: user.role, tokens, isAuthenticated: true }),
      logout: () => set({ role: "citizen", tokens: null, isAuthenticated: false }),
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

/** Read the bearer token outside React (used by the api-client). */
export const getAccessToken = (): string | null =>
  useSessionStore.getState().tokens?.accessToken ?? null;

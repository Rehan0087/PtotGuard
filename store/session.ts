"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/types";

/**
 * Client-only session state. In this frontend-first phase the "active role"
 * is chosen via the dev role switcher and sent to the mock API as a header.
 * When real auth lands, replace this with the authenticated user's role.
 */
interface SessionState {
  role: Role;
  setRole: (role: Role) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      role: "citizen",
      setRole: (role) => set({ role }),
    }),
    { name: "plotguard-session" },
  ),
);

/** Read the active role outside React (used by the api-client). */
export const getActiveRole = (): Role => useSessionStore.getState().role;

import type { User } from "@/lib/types";

const STORAGE_KEY = "plotguard.profile-records.v1";

type ProfileStorage = Pick<Storage, "getItem" | "setItem">;

interface StoredProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  profileDetails?: Record<string, string>;
}

interface StoredProfileState {
  version: 1;
  profiles: StoredProfile[];
}

function browserStorage(): ProfileStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function isStoredProfile(value: unknown): value is StoredProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<StoredProfile>;
  return typeof profile.id === "string"
    && typeof profile.name === "string"
    && typeof profile.email === "string"
    && (profile.phone === undefined || typeof profile.phone === "string")
    && (profile.avatarUrl === undefined || typeof profile.avatarUrl === "string")
    && (profile.profileDetails === undefined || isStringRecord(profile.profileDetails));
}

/** Apply persisted self-service fields without allowing storage to rewrite managed account data. */
export function restoreProfileState(users: User[], raw: string): void {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return;
  }

  if (!value || typeof value !== "object") return;
  const state = value as Partial<StoredProfileState>;
  if (state.version !== 1 || !Array.isArray(state.profiles)) return;

  for (const stored of state.profiles) {
    if (!isStoredProfile(stored)) continue;
    const user = users.find((candidate) => candidate.id === stored.id);
    if (!user) continue;

    user.name = stored.name;
    user.email = stored.email;
    user.phone = stored.phone;
    user.avatarUrl = stored.avatarUrl;
    user.profileDetails = stored.profileDetails
      ? { ...stored.profileDetails }
      : undefined;
  }
}

export function serializeProfileState(users: User[]): string {
  const state: StoredProfileState = {
    version: 1,
    profiles: users.map(({ id, name, email, phone, avatarUrl, profileDetails }) => ({
      id,
      name,
      email,
      ...(phone ? { phone } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(profileDetails ? { profileDetails: { ...profileDetails } } : {}),
    })),
  };
  return JSON.stringify(state);
}

/** Restore saved profile edits when the mock worker starts after a full page refresh. */
export function hydrateProfileState(
  users: User[],
  storage: ProfileStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) restoreProfileState(users, raw);
  } catch {
    // Private browsing or damaged preview storage must not stop authentication.
  }
}

/** Persist every editable field for every mock user after a profile update. */
export function persistProfileState(
  users: User[],
  storage: ProfileStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, serializeProfileState(users));
  } catch {
    // Preview persistence is best-effort when browser storage is unavailable.
  }
}

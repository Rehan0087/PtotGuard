import type { User } from "@/lib/types";

export interface FieldProfileFormValues {
  name: string;
  email: string;
  phone: string;
  avatarUrl: string;
  currentAddress: string;
  emergencyContact: string;
}

export type FieldProfileUpdate = FieldProfileFormValues;

export const PROFILE_PHOTO_MAX_BYTES = 512 * 1024;
export const PROFILE_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

type ProfilePhotoFile = Pick<File, "type" | "size">;

export function validateProfilePhotoFile(file: ProfilePhotoFile): "type" | "size" | undefined {
  if (!PROFILE_PHOTO_TYPES.includes(file.type as (typeof PROFILE_PHOTO_TYPES)[number])) {
    return "type";
  }
  if (file.size > PROFILE_PHOTO_MAX_BYTES) return "size";
  return undefined;
}

export class MockProfileUpdateError extends Error {
  readonly status: 400 | 404 | 409;
  readonly code: string;

  constructor(status: 400 | 404 | 409, code: string) {
    super(code);
    this.name = "MockProfileUpdateError";
    this.status = status;
    this.code = code;
  }
}

export function fieldProfilePayload(values: FieldProfileFormValues): FieldProfileUpdate {
  return {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    phone: values.phone.trim(),
    avatarUrl: values.avatarUrl.trim(),
    currentAddress: values.currentAddress.trim(),
    emergencyContact: values.emergencyContact.trim(),
  };
}

export function validateFieldProfile(values: FieldProfileFormValues): Array<keyof FieldProfileFormValues> {
  const normalized = fieldProfilePayload(values);
  const invalid: Array<keyof FieldProfileFormValues> = [];
  if (normalized.name.length < 2 || normalized.name.length > 100) invalid.push("name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) invalid.push("email");
  if (normalized.phone.length > 32) invalid.push("phone");
  if (!isValidUrl(normalized.avatarUrl)) invalid.push("avatarUrl");
  if (normalized.currentAddress.length > 500) invalid.push("currentAddress");
  if (normalized.emergencyContact.length > 64) invalid.push("emergencyContact");
  return invalid;
}

function isValidUrl(value: string): boolean {
  if (!value) return true;
  if (isValidProfilePhotoDataUrl(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidProfilePhotoDataUrl(value: string): boolean {
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const encoded = match[1];
  if (encoded.length % 4 !== 0) return false;
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return (encoded.length * 3) / 4 - padding <= PROFILE_PHOTO_MAX_BYTES;
}

export function applyMockProfileUpdate(
  users: User[],
  userId: string,
  input: Record<string, unknown>,
): User {
  const allowed = new Set([
    "name",
    "email",
    "phone",
    "avatarUrl",
    "currentAddress",
    "emergencyContact",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new MockProfileUpdateError(400, "managed-field");
  }
  const user = users.find((candidate) => candidate.id === userId);
  if (!user) throw new MockProfileUpdateError(404, "not-found");
  const values = fieldProfilePayload({
    name: typeof input.name === "string" ? input.name : user.name,
    email: typeof input.email === "string" ? input.email : user.email,
    phone: typeof input.phone === "string" ? input.phone : (user.phone ?? ""),
    avatarUrl: typeof input.avatarUrl === "string" ? input.avatarUrl : (user.avatarUrl ?? ""),
    currentAddress:
      typeof input.currentAddress === "string"
        ? input.currentAddress
        : (user.profileDetails?.currentAddress ?? ""),
    emergencyContact:
      typeof input.emergencyContact === "string"
        ? input.emergencyContact
        : (user.profileDetails?.emergencyContact ?? ""),
  });
  if (validateFieldProfile(values).length) throw new MockProfileUpdateError(400, "invalid-profile-field");
  const emailOwner = users.find(
    (candidate) =>
      candidate.id !== user.id && candidate.email.toLowerCase() === values.email.toLowerCase(),
  );
  if (emailOwner) throw new MockProfileUpdateError(409, "email-in-use");

  user.name = values.name;
  user.email = values.email;
  user.phone = values.phone || undefined;
  user.avatarUrl = values.avatarUrl || undefined;
  user.profileDetails = {
    ...(user.profileDetails ?? {}),
    currentAddress: values.currentAddress,
    emergencyContact: values.emergencyContact,
  };
  return user;
}

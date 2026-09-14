import {
  Validate,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

export const PROFILE_PHOTO_MAX_BYTES = 512 * 1024;

function isHttpUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isProfileImageSource(value: unknown): boolean {
  if (value === "") return true;
  if (typeof value !== "string") return false;
  if (isHttpUrl(value)) return true;

  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const encoded = match[1];
  if (encoded.length % 4 !== 0) return false;
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return (encoded.length * 3) / 4 - padding <= PROFILE_PHOTO_MAX_BYTES;
}

@ValidatorConstraint({ name: "isProfileImageSource", async: false })
class ProfileImageSourceConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isProfileImageSource(value);
  }

  defaultMessage(): string {
    return "avatarUrl must be an HTTP(S) URL or a PNG, JPEG, or WebP image up to 512 KB";
  }
}

export function IsProfileImageSource(validationOptions?: ValidationOptions): PropertyDecorator {
  return Validate(ProfileImageSourceConstraint, validationOptions);
}

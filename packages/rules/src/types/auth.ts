import type { User, Jurisdiction } from "./user";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

/** Response of GET /auth/me — the signed-in user and their jurisdiction. */
export interface AuthMe {
  user: User;
  jurisdiction: Jurisdiction | null;
}

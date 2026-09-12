import { SetMetadata } from "@nestjs/common";
import type { Role } from "@plotguard/rules";

export const ROLES_KEY = "plotguard.roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

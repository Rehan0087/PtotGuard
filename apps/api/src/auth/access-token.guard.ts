import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Role } from "@plotguard/rules";
import type { AuthenticatedRequest } from "./dev-current-user";
import { verifyAuthToken } from "./dev-current-user";

@Injectable()
export class AccessTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException("Authentication required");

    try {
      const payload = verifyAuthToken(match[1], "access");
      request.user = { id: payload.sub, role: payload.role as Role };
      return true;
    } catch {
      throw new UnauthorizedException("Session expired or invalid");
    }
  }
}

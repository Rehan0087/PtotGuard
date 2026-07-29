import { Controller, Get } from "@nestjs/common";

export interface HealthResponse {
  status: "ok";
  /** Present so a deploy can be identified without shelling in. */
  version: string;
  uptimeSeconds: number;
}

/**
 * Liveness only — it deliberately does not touch the database. A health check
 * that fails when a dependency is slow gets the process restarted mid-request,
 * which is the opposite of what a struggling system needs. Readiness (can I
 * serve traffic?) is a separate check, added when there is a database to ask.
 */
@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: "ok",
      version: process.env.npm_package_version ?? "0.0.0",
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}

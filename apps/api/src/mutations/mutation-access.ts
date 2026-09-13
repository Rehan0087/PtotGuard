import { ForbiddenException } from "@nestjs/common";
import { descendantIds, type Jurisdiction } from "@plotguard/rules";
import type { Request } from "express";
import { currentUserId } from "../auth/dev-current-user";
import { PrismaService } from "../prisma/prisma.service";

export interface MutationActor {
  id: string;
  role: string;
  status: string;
  jurisdictionId: string;
}

/** descendantIds only reads these tree fields, which Prisma returns verbatim. */
type JurisdictionTreeRow = Pick<Jurisdiction, "id" | "parentId">;

export function assertLandOfficeActor(actor: MutationActor): void {
  if (actor.role !== "land-office" || actor.status !== "active") {
    throw new ForbiddenException("Land Office Staff access required.");
  }
}

export async function loadMutationReadActor(
  prisma: PrismaService,
  req: Request,
): Promise<MutationActor> {
  const requestedRole = req.header("x-plotguard-role");
  if (requestedRole && requestedRole !== "citizen" && requestedRole !== "land-office") {
    throw new ForbiddenException("Citizen or Land Office Staff access required.");
  }
  const actor = await prisma.user.findUnique({ where: { id: currentUserId(req) } });
  if (
    !actor ||
    actor.status !== "active" ||
    (actor.role !== "citizen" && actor.role !== "land-office")
  ) {
    throw new ForbiddenException("Citizen or Land Office Staff access required.");
  }
  return actor;
}

/**
 * The request header selects a demo identity, but it is not itself an
 * authorization claim. Load that identity so role, status, and jurisdiction
 * remain server-side facts.
 */
export async function loadMutationActor(prisma: PrismaService, req: Request): Promise<MutationActor> {
  const actor = await loadMutationReadActor(prisma, req);
  assertLandOfficeActor(actor);
  return actor;
}

export function coveredJurisdictionIds(
  actor: Pick<MutationActor, "jurisdictionId">,
  jurisdictions: JurisdictionTreeRow[],
): Set<string> {
  return new Set([
    actor.jurisdictionId,
    ...descendantIds(actor.jurisdictionId, jurisdictions as Jurisdiction[]),
  ]);
}

/** An officer may claim an unassigned mutation, or continue their own work. */
export function assertMutationActionAccess(
  actor: Pick<MutationActor, "id">,
  mutation: { assignedOfficerId: string | null },
): void {
  if (mutation.assignedOfficerId && mutation.assignedOfficerId !== actor.id) {
    throw new ForbiddenException("This mutation is assigned to another officer.");
  }
}

import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { computeHash } from "./audit-hash";

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  payload: Prisma.InputJsonValue;
}

/** Arbitrary but fixed — pg_advisory_xact_lock needs one stable key for "the ledger". */
const LEDGER_LOCK_KEY = 872_346_123;

@Injectable()
export class AuditService {
  /**
   * Appends one link to the ledger. Must run inside the same transaction as
   * the domain write it is recording (pass `tx`, not a fresh query) — a
   * mutation decision that commits while its audit entry doesn't, or the
   * reverse, is exactly the inconsistency the ledger exists to rule out.
   *
   * Serialized with an advisory lock scoped to that transaction: two writers
   * appending at once would otherwise both read the same tail hash and each
   * compute a "next" link from it, forking the chain. The mock never had
   * this race — one browser tab, one array, no concurrency — but a real
   * database answering concurrent requests does.
   */
  async append(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_KEY})`;

    // Denormalised onto the row, same as the mock's appendAudit() — every
    // caller needing this on every write is the signal it belongs here once,
    // not repeated at each call site with a lookup that's easy to forget.
    const [tail, actor] = await Promise.all([
      tx.auditEvent.findFirst({ orderBy: { createdAt: "desc" } }),
      tx.user.findUnique({ where: { id: entry.actorId }, select: { name: true } }),
    ]);
    const prevHash = tail?.hash ?? "";
    const createdAt = new Date();
    const hash = computeHash(prevHash, {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId,
      payload: entry.payload,
      createdAt: createdAt.toISOString(),
    });

    await tx.auditEvent.create({
      data: {
        id: `au-${randomUUID()}`,
        ...entry,
        actorName: actor?.name,
        createdAt,
        prevHash,
        hash,
      },
    });
  }
}

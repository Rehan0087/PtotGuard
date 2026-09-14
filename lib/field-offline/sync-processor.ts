import type { ApiError } from "@/lib/api-client";
import type { FieldOfflineRepository } from "./repository.ts";
import type { FieldSyncAcknowledgement, FieldSyncOperation } from "./types.ts";

const MAX_AUTOMATIC_RETRIES = 5;

interface SyncTransport {
  isOnline: () => boolean;
  send: (operation: FieldSyncOperation) => Promise<FieldSyncAcknowledgement>;
}

function errorDetails(error: unknown): { message: string; status?: number; reason?: unknown } {
  if (error instanceof Error) {
    const apiError = error as Error & Partial<Pick<ApiError, "status" | "reason">>;
    return { message: error.message, status: apiError.status, reason: apiError.reason };
  }
  return { message: String(error) };
}

export class FieldSyncProcessor {
  private running = false;
  private readonly repository: FieldOfflineRepository;
  private readonly transport: SyncTransport;

  constructor(repository: FieldOfflineRepository, transport: SyncTransport) {
    this.repository = repository;
    this.transport = transport;
  }

  async process(assignedAgentId: string, ignoreBackoff = false): Promise<void> {
    if (this.running || !this.transport.isOnline()) return;
    this.running = true;
    try {
      await this.repository.recoverInterruptedUploads();
      const operations = (await this.repository.listOperations()).filter(
        (operation) => operation.assigned_agent_id === assignedAgentId,
      );
      const blockedSurveys = new Set<string>();
      for (const operation of operations) {
        if (!this.transport.isOnline()) break;
        if (blockedSurveys.has(operation.survey_key)) continue;
        if (operation.sync_status === "SYNCED") continue;
        if (operation.sync_status === "CONFLICT") {
          blockedSurveys.add(operation.survey_key);
          continue;
        }
        if (operation.retry_count >= MAX_AUTOMATIC_RETRIES) {
          blockedSurveys.add(operation.survey_key);
          continue;
        }
        if (
          operation.sync_status === "FAILED" &&
          !ignoreBackoff &&
          operation.next_attempt_at &&
          Date.parse(operation.next_attempt_at) > Date.now()
        ) {
          blockedSurveys.add(operation.survey_key);
          continue;
        }
        await this.repository.updateOperation(operation.local_id, { sync_status: "UPLOADING" });
        try {
          const currentSurvey = await this.repository.getSurvey(operation.survey_key);
          const outbound =
            operation.operation_type === "COMPLETE_SURVEY" && currentSurvey?.serverVersion
              ? {
                  ...operation,
                  payload: { ...operation.payload, expectedVersion: currentSurvey.serverVersion },
                }
              : operation;
          const acknowledgement = await this.transport.send(outbound);
          await this.repository.updateOperation(operation.local_id, {
            sync_status: "SYNCED",
            last_error: undefined,
            next_attempt_at: undefined,
            response: acknowledgement,
          });
          const serverVersion =
            acknowledgement.version ?? acknowledgement.survey?.version;
          await this.repository.updateSurvey(operation.survey_key, {
            ...(acknowledgement.sessionId || acknowledgement.survey?.id
              ? { serverSessionId: acknowledgement.sessionId ?? acknowledgement.survey?.id }
              : {}),
            ...(serverVersion === undefined ? {} : { serverVersion }),
            syncStatus: "SYNCED",
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          const details = errorDetails(error);
          if (details.status === 409) {
            const serverData =
              details.reason && typeof details.reason === "object" && "serverData" in details.reason
                ? (details.reason as { serverData: unknown }).serverData
                : details.reason;
            await this.repository.updateOperation(operation.local_id, {
              sync_status: "CONFLICT",
              last_error: details.message,
              conflict: { localData: operation.payload, serverData },
            });
            await this.repository.updateSurvey(operation.survey_key, {
              syncStatus: "CONFLICT",
              updatedAt: new Date().toISOString(),
            });
          } else {
            const retryCount = operation.retry_count + 1;
            const delaySeconds = Math.min(300, 2 ** retryCount);
            await this.repository.updateOperation(operation.local_id, {
              sync_status: "FAILED",
              retry_count: retryCount,
              last_error: details.message,
              next_attempt_at: new Date(Date.now() + delaySeconds * 1_000).toISOString(),
            });
            await this.repository.updateSurvey(operation.survey_key, {
              syncStatus: "FAILED",
              updatedAt: new Date().toISOString(),
            });
          }
          blockedSurveys.add(operation.survey_key);
        }
      }
    } finally {
      this.running = false;
    }
  }

  async retry(localId: string, assignedAgentId: string): Promise<void> {
    await this.repository.updateOperation(localId, {
      sync_status: "PENDING",
      next_attempt_at: undefined,
      last_error: undefined,
    });
    await this.process(assignedAgentId, true);
  }
}

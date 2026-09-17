import type {
  FieldSyncOperation,
  FieldSyncOperationType,
  FieldSyncStatus,
  LocalGpsPoint,
  OfflineFieldSurvey,
} from "./types.ts";

const DB_VERSION = 2;
const MAX_POINT_BATCH = 50;

interface RepositoryOptions {
  indexedDB?: IDBFactory;
  dbName?: string;
  now?: () => string;
  createId?: () => string;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function lifecycleOrder(operation: FieldSyncOperation): number {
  if (operation.operation_type === "START_SURVEY") return 0;
  if (operation.operation_type === "APPEND_POINTS") return 1;
  return 2;
}

function firstPointSequence(operation: FieldSyncOperation): number {
  if (operation.operation_type !== "APPEND_POINTS" || !Array.isArray(operation.payload.points)) {
    return 0;
  }
  return (operation.payload.points[0] as { sequence?: number } | undefined)?.sequence ?? 0;
}

export class FieldOfflineRepository {
  private readonly factory: IDBFactory;
  private readonly dbName: string;
  private readonly now: () => string;
  private readonly createId: () => string;
  private database?: Promise<IDBDatabase>;

  constructor(options: RepositoryOptions = {}) {
    if (!options.indexedDB && typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is unavailable");
    }
    this.factory = options.indexedDB ?? indexedDB;
    this.dbName = options.dbName ?? "plotguard-field-offline";
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise((resolve, reject) => {
      const request = this.factory.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("surveys")) {
          const surveys = database.createObjectStore("surveys", { keyPath: "key" });
          surveys.createIndex("reportAgent", ["fieldReportId", "assignedAgentId"], { unique: true });
        }
        if (!database.objectStoreNames.contains("points")) {
          const points = database.createObjectStore("points", { keyPath: "id" });
          points.createIndex("surveySequence", ["surveyKey", "sequence"], { unique: true });
          points.createIndex("surveyKey", "surveyKey");
        }
        if (!database.objectStoreNames.contains("operations")) {
          const operations = database.createObjectStore("operations", { keyPath: "local_id" });
          operations.createIndex("surveyCreated", ["survey_key", "created_at"]);
          operations.createIndex("agentCreated", ["assigned_agent_id", "created_at"]);
        }
        if (!database.objectStoreNames.contains("meta")) {
          database.createObjectStore("meta", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open offline field database"));
      request.onblocked = () => reject(new Error("Offline field database upgrade is blocked"));
    });
    return this.database;
  }

  private operation(
    survey: OfflineFieldSurvey,
    operationType: FieldSyncOperationType,
    payload: Record<string, unknown>,
  ): FieldSyncOperation {
    return {
      local_id: this.createId(),
      operation_type: operationType,
      entity_type: "field-survey",
      entity_id: survey.fieldReportId,
      survey_key: survey.key,
      assigned_agent_id: survey.assignedAgentId,
      payload,
      created_at: this.now(),
      sync_status: "PENDING",
      retry_count: 0,
    };
  }

  async createSurvey(survey: OfflineFieldSurvey): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(["surveys", "operations"], "readwrite");
    const surveys = transaction.objectStore("surveys");
    const existing = await requestResult(surveys.get(survey.key));
    if (existing) {
      transaction.abort();
      throw new Error("An offline survey already exists for this field report and agent");
    }
    surveys.add(survey);
    transaction.objectStore("operations").add(
      this.operation(survey, "START_SURVEY", {
        localSessionId: survey.localSessionId,
      }),
    );
    await transactionDone(transaction);
  }

  async upsertSurvey(survey: OfflineFieldSurvey): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction("surveys", "readwrite");
    transaction.objectStore("surveys").put(survey);
    await transactionDone(transaction);
  }

  async getSurvey(key: string): Promise<OfflineFieldSurvey | undefined> {
    const database = await this.open();
    const value = await requestResult(database.transaction("surveys").objectStore("surveys").get(key));
    return value as OfflineFieldSurvey | undefined;
  }

  async findActiveSurvey(
    fieldReportId: string,
    assignedAgentId: string,
  ): Promise<OfflineFieldSurvey | undefined> {
    const database = await this.open();
    const transaction = database.transaction("surveys");
    const value = await requestResult(
      transaction.objectStore("surveys").index("reportAgent").get([fieldReportId, assignedAgentId]),
    );
    const survey = value as OfflineFieldSurvey | undefined;
    return survey && survey.state !== "completed" ? survey : undefined;
  }

  async appendPoint(point: LocalGpsPoint): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(["surveys", "points", "operations"], "readwrite");
    const points = transaction.objectStore("points");
    const existing = (await requestResult(points.get(point.id))) as LocalGpsPoint | undefined;
    if (existing) {
      if (stable(existing) !== stable(point)) {
        transaction.abort();
        throw new Error("GPS point already exists with different data");
      }
      await transactionDone(transaction);
      return;
    }
    const sequenceMatch = (await requestResult(
      points.index("surveySequence").get([point.surveyKey, point.sequence]),
    )) as LocalGpsPoint | undefined;
    if (sequenceMatch) {
      transaction.abort();
      throw new Error("GPS sequence already exists with different data");
    }
    const survey = (await requestResult(
      transaction.objectStore("surveys").get(point.surveyKey),
    )) as OfflineFieldSurvey | undefined;
    if (!survey || survey.state === "completed") {
      transaction.abort();
      throw new Error("No active offline survey exists for this GPS point");
    }

    points.add(point);
    const operationsStore = transaction.objectStore("operations");
    const all = (await requestResult(operationsStore.getAll())) as FieldSyncOperation[];
    const pending = all
      .filter(
        (operation) =>
          operation.survey_key === point.surveyKey &&
          operation.operation_type === "APPEND_POINTS" &&
          operation.sync_status === "PENDING" &&
          Array.isArray(operation.payload.points) &&
          operation.payload.points.length < MAX_POINT_BATCH,
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .at(-1);
    if (pending) {
      pending.payload = { points: [...(pending.payload.points as LocalGpsPoint[]), point] };
      operationsStore.put(pending);
    } else {
      operationsStore.add(this.operation(survey, "APPEND_POINTS", { points: [point] }));
    }
    await transactionDone(transaction);
  }

  async listPoints(surveyKey: string): Promise<LocalGpsPoint[]> {
    const database = await this.open();
    const values = (await requestResult(
      database.transaction("points").objectStore("points").index("surveyKey").getAll(surveyKey),
    )) as LocalGpsPoint[];
    return values.sort((a, b) => a.sequence - b.sequence);
  }

  async storeAcknowledgedPoint(point: LocalGpsPoint): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction("points", "readwrite");
    const store = transaction.objectStore("points");
    const existing = (await requestResult(store.get(point.id))) as LocalGpsPoint | undefined;
    if (!existing) store.add(point);
    else if (stable(existing) !== stable(point)) {
      transaction.abort();
      throw new Error("Acknowledged GPS point conflicts with local raw data");
    }
    await transactionDone(transaction);
  }

  async queueCompletion(
    surveyKey: string,
    notes: string,
    completedAt = this.now(),
    summary?: OfflineFieldSurvey["summary"],
    finding?: { disputeFound: boolean; disputeDescription?: string },
  ): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(["surveys", "operations"], "readwrite");
    const surveys = transaction.objectStore("surveys");
    const survey = (await requestResult(surveys.get(surveyKey))) as OfflineFieldSurvey | undefined;
    if (!survey) {
      transaction.abort();
      throw new Error("Offline survey not found");
    }
    const updated = {
      ...survey,
      state: "completed" as const,
      completedAt,
      notes,
      summary,
      syncStatus: "PENDING" as const,
      updatedAt: completedAt,
    };
    surveys.put(updated);
    transaction.objectStore("operations").add(
      this.operation(updated, "COMPLETE_SURVEY", {
        notes,
        disputeFound: finding?.disputeFound ?? false,
        ...(finding?.disputeFound && finding.disputeDescription
          ? { disputeDescription: finding.disputeDescription }
          : {}),
      }),
    );
    await transactionDone(transaction);
  }

  async listOperations(surveyKey?: string): Promise<FieldSyncOperation[]> {
    const database = await this.open();
    const values = (await requestResult(
      database.transaction("operations").objectStore("operations").getAll(),
    )) as FieldSyncOperation[];
    return values
      .filter((operation) => !surveyKey || operation.survey_key === surveyKey)
      .sort((a, b) => {
        if (a.survey_key === b.survey_key) {
          return (
            lifecycleOrder(a) - lifecycleOrder(b) ||
            firstPointSequence(a) - firstPointSequence(b) ||
            a.created_at.localeCompare(b.created_at)
          );
        }
        return a.created_at.localeCompare(b.created_at) || a.local_id.localeCompare(b.local_id);
      });
  }

  async updateOperation(
    localId: string,
    patch: Partial<Omit<FieldSyncOperation, "local_id">>,
  ): Promise<FieldSyncOperation> {
    const database = await this.open();
    const transaction = database.transaction("operations", "readwrite");
    const store = transaction.objectStore("operations");
    const existing = (await requestResult(store.get(localId))) as FieldSyncOperation | undefined;
    if (!existing) {
      transaction.abort();
      throw new Error("Sync operation not found");
    }
    const updated = { ...existing, ...patch };
    store.put(updated);
    await transactionDone(transaction);
    return updated;
  }

  async updateSurvey(
    key: string,
    patch: Partial<Omit<OfflineFieldSurvey, "key">>,
  ): Promise<OfflineFieldSurvey> {
    const survey = await this.getSurvey(key);
    if (!survey) throw new Error("Offline survey not found");
    const updated = { ...survey, ...patch };
    await this.upsertSurvey(updated);
    return updated;
  }

  async recoverInterruptedUploads(): Promise<void> {
    const operations = await this.listOperations();
    await Promise.all(
      operations
        .filter((operation) => operation.sync_status === "UPLOADING")
        .map((operation) =>
          this.updateOperation(operation.local_id, {
            sync_status: "PENDING",
            last_error: "Upload interrupted before acknowledgement",
          }),
        ),
    );
  }

  async acquireSyncLease(owner: string, ttlMilliseconds = 15_000): Promise<boolean> {
    const database = await this.open();
    const transaction = database.transaction("meta", "readwrite");
    const store = transaction.objectStore("meta");
    const existing = (await requestResult(store.get("sync-lease"))) as
      | { key: string; owner: string; expiresAt: number }
      | undefined;
    const now = Date.now();
    if (existing && existing.owner !== owner && existing.expiresAt > now) {
      await transactionDone(transaction);
      return false;
    }
    store.put({ key: "sync-lease", owner, expiresAt: now + ttlMilliseconds });
    await transactionDone(transaction);
    return true;
  }

  async releaseSyncLease(owner: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction("meta", "readwrite");
    const store = transaction.objectStore("meta");
    const existing = (await requestResult(store.get("sync-lease"))) as
      | { key: string; owner: string }
      | undefined;
    if (existing?.owner === owner) store.delete("sync-lease");
    await transactionDone(transaction);
  }
}

let singleton: FieldOfflineRepository | undefined;

export function getFieldOfflineRepository(): FieldOfflineRepository {
  singleton ??= new FieldOfflineRepository();
  return singleton;
}

export function surveyKey(fieldReportId: string, assignedAgentId: string): string {
  return `${assignedAgentId}:${fieldReportId}`;
}

export function isPendingStatus(status: FieldSyncStatus): boolean {
  return status === "PENDING" || status === "FAILED" || status === "UPLOADING";
}

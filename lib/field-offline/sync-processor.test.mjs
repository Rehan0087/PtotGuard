import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { FieldOfflineRepository } from "./repository.ts";
import { FieldSyncProcessor } from "./sync-processor.ts";

const survey = {
  key: "usr-agent:fr-1",
  fieldReportId: "fr-1",
  assignedAgentId: "usr-agent",
  localSessionId: "550e8400-e29b-41d4-a716-446655440010",
  serverVersion: 0,
  state: "active",
  syncStatus: "PENDING",
  startedAt: "2026-09-14T05:00:00.000Z",
  updatedAt: "2026-09-14T05:00:00.000Z",
};

function makeRepo(name) {
  let id = 0;
  return new FieldOfflineRepository({
    indexedDB: new IDBFactory(),
    dbName: name,
    now: () => "2026-09-14T05:00:00.000Z",
    createId: () => `operation-${++id}`,
  });
}

test("synchronizes in creation order and exact reprocessing has no duplicates", async () => {
  const repo = makeRepo("sync-success");
  await repo.createSurvey(survey);
  const sent = [];
  const processor = new FieldSyncProcessor(repo, {
    isOnline: () => true,
    send: async (operation) => {
      sent.push(operation.local_id);
      return operation.operation_type === "START_SURVEY"
        ? { sessionId: "server-session", version: 1 }
        : { version: 2 };
    },
  });

  await processor.process(survey.assignedAgentId);
  await processor.process(survey.assignedAgentId);

  assert.deepEqual(sent, ["operation-1"]);
  assert.equal((await repo.listOperations(survey.key))[0].sync_status, "SYNCED");
  assert.equal((await repo.getSurvey(survey.key)).serverSessionId, "server-session");
});

test("preserves local and server data when the server reports a conflict", async () => {
  const repo = makeRepo("sync-conflict");
  await repo.createSurvey(survey);
  const processor = new FieldSyncProcessor(repo, {
    isOnline: () => true,
    send: async () => {
      const error = new Error("conflict");
      error.status = 409;
      error.reason = { serverData: { version: 3 } };
      throw error;
    },
  });

  await processor.process(survey.assignedAgentId);
  const operation = (await repo.listOperations(survey.key))[0];
  assert.equal(operation.sync_status, "CONFLICT");
  assert.deepEqual(operation.conflict, {
    localData: operation.payload,
    serverData: { version: 3 },
  });
});

test("failed uploads remain retryable and stop automatic retries after five attempts", async () => {
  const repo = makeRepo("sync-failure");
  await repo.createSurvey(survey);
  let attempts = 0;
  const processor = new FieldSyncProcessor(repo, {
    isOnline: () => true,
    send: async () => {
      attempts += 1;
      throw new Error("network unavailable");
    },
  });

  for (let run = 0; run < 7; run += 1) await processor.process(survey.assignedAgentId, true);

  const operation = (await repo.listOperations(survey.key))[0];
  assert.equal(attempts, 5);
  assert.equal(operation.sync_status, "FAILED");
  assert.equal(operation.retry_count, 5);
  assert.match(operation.last_error, /network unavailable/);

  const recovered = new FieldSyncProcessor(repo, {
    isOnline: () => true,
    send: async () => ({ sessionId: "server-after-manual-retry", version: 1 }),
  });
  await recovered.retryFailed(survey.assignedAgentId);
  assert.equal((await repo.listOperations(survey.key))[0].sync_status, "SYNCED");
});

test("offline capture survives reload and synchronizes once without duplicate server points", async () => {
  const indexedDB = new IDBFactory();
  let operationId = 0;
  const options = {
    indexedDB,
    dbName: "offline-reload-reconnect",
    now: () => "2026-09-14T05:00:00.000Z",
    createId: () => `operation-${++operationId}`,
  };
  const offlineRepo = new FieldOfflineRepository(options);
  await offlineRepo.createSurvey(survey);
  await offlineRepo.appendPoint({
    id: "550e8400-e29b-41d4-a716-446655440001",
    surveyKey: survey.key,
    fieldReportId: survey.fieldReportId,
    localSessionId: survey.localSessionId,
    sequence: 1,
    latitude: 23.55,
    longitude: 90.99,
    recordedAt: "2026-09-14T05:00:01.000Z",
    accuracyMeters: 5,
  });
  await offlineRepo.queueCompletion(survey.key, "Boundary walked and checked.");
  let online = false;
  const serverPointIds = new Set();
  const receipts = new Map();
  let serverVersion = 0;
  const send = async (operation) => {
    if (receipts.has(operation.local_id)) return receipts.get(operation.local_id);
    let response;
    if (operation.operation_type === "START_SURVEY") response = { sessionId: "server-1", version: ++serverVersion };
    if (operation.operation_type === "APPEND_POINTS") {
      operation.payload.points.forEach((point) => serverPointIds.add(point.id));
      response = { version: ++serverVersion };
    }
    if (operation.operation_type === "COMPLETE_SURVEY") {
      assert.equal(operation.payload.expectedVersion, serverVersion);
      response = { survey: { id: "server-1", version: ++serverVersion, status: "completed" } };
    }
    receipts.set(operation.local_id, response);
    return response;
  };

  await new FieldSyncProcessor(offlineRepo, { isOnline: () => online, send }).process("usr-agent");
  assert.equal(receipts.size, 0);

  const restoredRepo = new FieldOfflineRepository(options);
  assert.equal((await restoredRepo.listPoints(survey.key)).length, 1);
  online = true;
  const processor = new FieldSyncProcessor(restoredRepo, { isOnline: () => online, send });
  await processor.process("usr-agent");
  await processor.process("usr-agent");

  assert.equal(serverPointIds.size, 1);
  assert.equal(receipts.size, 3);
  assert.deepEqual(
    (await restoredRepo.listOperations(survey.key)).map((operation) => operation.sync_status),
    ["SYNCED", "SYNCED", "SYNCED"],
  );
});

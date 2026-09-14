import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { FieldOfflineRepository } from "./repository.ts";

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

function point(sequence) {
  return {
    id: `550e8400-e29b-41d4-a716-4466554400${sequence.toString().padStart(2, "0")}`,
    surveyKey: survey.key,
    fieldReportId: survey.fieldReportId,
    localSessionId: survey.localSessionId,
    sequence,
    latitude: 23.55 + sequence / 10_000,
    longitude: 90.99 + sequence / 10_000,
    recordedAt: new Date(Date.parse(survey.startedAt) + sequence * 1_000).toISOString(),
    accuracyMeters: 4,
  };
}

function repository(indexedDB, dbName = "test-field-offline") {
  let id = 0;
  return new FieldOfflineRepository({
    indexedDB,
    dbName,
    now: () => "2026-09-14T05:00:00.000Z",
    createId: () => `operation-${++id}`,
  });
}

test("stores a survey, point, and pending upload atomically", async () => {
  const repo = repository(new IDBFactory());
  await repo.createSurvey(survey);
  await repo.appendPoint(point(1));

  assert.deepEqual(await repo.getSurvey(survey.key), survey);
  assert.deepEqual(await repo.listPoints(survey.key), [point(1)]);
  const operations = await repo.listOperations(survey.key);
  assert.equal(operations.length, 2);
  assert.equal(operations[0].operation_type, "START_SURVEY");
  assert.equal(operations[1].operation_type, "APPEND_POINTS");
  assert.deepEqual(operations[1].payload, { points: [point(1)] });
});

test("batches up to fifty pending GPS points without losing order", async () => {
  const repo = repository(new IDBFactory());
  await repo.createSurvey(survey);
  for (let sequence = 1; sequence <= 51; sequence += 1) {
    await repo.appendPoint(point(sequence));
  }

  const appends = (await repo.listOperations(survey.key)).filter(
    (operation) => operation.operation_type === "APPEND_POINTS",
  );
  assert.equal(appends.length, 2);
  assert.equal(appends[0].payload.points.length, 50);
  assert.equal(appends[1].payload.points.length, 1);
  assert.deepEqual(
    (await repo.listPoints(survey.key)).map((value) => value.sequence),
    Array.from({ length: 51 }, (_, index) => index + 1),
  );
});

test("restores the same active survey after a repository reload", async () => {
  const indexedDB = new IDBFactory();
  await repository(indexedDB, "reload-test").createSurvey(survey);

  const restored = repository(indexedDB, "reload-test");
  assert.deepEqual(await restored.findActiveSurvey("fr-1", "usr-agent"), survey);
});

test("rejects a changed duplicate point instead of overwriting raw GPS", async () => {
  const repo = repository(new IDBFactory());
  await repo.createSurvey(survey);
  await repo.appendPoint(point(1));

  await assert.rejects(
    repo.appendPoint({ ...point(1), latitude: 24 }),
    /GPS point already exists with different data/,
  );
  assert.equal((await repo.listPoints(survey.key))[0].latitude, point(1).latitude);
});

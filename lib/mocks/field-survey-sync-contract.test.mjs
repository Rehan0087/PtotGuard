import assert from "node:assert/strict";
import test from "node:test";
import * as contract from "./field-survey-sync-contract.ts";

const firstPoint = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  sequence: 1,
  latitude: 23.55,
  longitude: 90.99,
  recordedAt: "2026-09-14T05:00:00.000Z",
  accuracyMeters: 4,
};

test("an exact operation replay returns one acknowledgement and one side effect", async () => {
  const receipts = [];
  let executions = 0;
  const operation = {
    key: "550e8400-e29b-41d4-a716-446655440010",
    actorId: "usr-agent",
    fieldReportId: "fr-1",
    operationType: "APPEND_POINTS",
    payload: { points: [firstPoint] },
  };
  const run = () => {
    executions += 1;
    return { acceptedThroughSequence: 1 };
  };

  const first = await contract.runMockIdempotent(receipts, operation, run);
  const replay = await contract.runMockIdempotent(receipts, operation, run);

  assert.deepEqual(first, { acceptedThroughSequence: 1 });
  assert.deepEqual(replay, first);
  assert.equal(executions, 1);
  assert.equal(receipts.length, 1);
});

test("changed data cannot reuse an idempotency key", async () => {
  const receipts = [];
  const operation = {
    key: "550e8400-e29b-41d4-a716-446655440010",
    actorId: "usr-agent",
    fieldReportId: "fr-1",
    operationType: "APPEND_POINTS",
    payload: { points: [firstPoint] },
  };
  await contract.runMockIdempotent(receipts, operation, () => ({ ok: true }));

  await assert.rejects(
    contract.runMockIdempotent(
      receipts,
      { ...operation, payload: { points: [{ ...firstPoint, latitude: 24 }] } },
      () => ({ ok: true }),
    ),
    (error) => error?.code === "idempotency-key-reused",
  );
});

test("point appends are contiguous and duplicate-free", () => {
  const stored = [];
  const first = contract.appendMockGpsPoints(stored, "survey-1", [firstPoint]);
  const replay = contract.appendMockGpsPoints(stored, "survey-1", [firstPoint]);

  assert.equal(first.acceptedThroughSequence, 1);
  assert.equal(replay.acceptedThroughSequence, 1);
  assert.equal(stored.length, 1);
  assert.throws(
    () =>
      contract.appendMockGpsPoints(stored, "survey-1", [
        { ...firstPoint, id: "550e8400-e29b-41d4-a716-446655440002", sequence: 3 },
      ]),
    (error) => error?.code === "gps-sequence-gap",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  GeolocationFailure,
  gpsPointFromPosition,
  permissionState,
  requestGpsFix,
  watchGps,
} from "./geolocation.ts";

function position(overrides = {}) {
  return {
    timestamp: Date.parse("2026-09-14T05:00:00.000Z"),
    coords: {
      latitude: 23.55,
      longitude: 90.99,
      accuracy: 4.25,
      altitude: null,
      altitudeAccuracy: null,
      speed: null,
      heading: null,
      ...overrides,
    },
  };
}

test("detects granted and denied permission states", async () => {
  assert.equal(await permissionState({ query: async () => ({ state: "granted" }) }), "granted");
  assert.equal(await permissionState({ query: async () => ({ state: "denied" }) }), "denied");
});

test("reports unavailable GPS without creating a coordinate", async () => {
  await assert.rejects(requestGpsFix(undefined), (error) => error?.code === "unavailable");
});

test("maps denial and timeout errors to stable failure codes", async () => {
  const geolocation = {
    getCurrentPosition: (_success, failure) => failure({ code: 1, message: "denied" }),
  };
  await assert.rejects(requestGpsFix(geolocation), (error) => error?.code === "denied");

  geolocation.getCurrentPosition = (_success, failure) => failure({ code: 3, message: "timeout" });
  await assert.rejects(requestGpsFix(geolocation), (error) => error?.code === "timeout");
});

test("keeps only sensor values actually supplied by the device", () => {
  const withoutOptional = gpsPointFromPosition(
    position(),
    1,
    "550e8400-e29b-41d4-a716-446655440001",
  );
  assert.deepEqual(withoutOptional, {
    id: "550e8400-e29b-41d4-a716-446655440001",
    sequence: 1,
    latitude: 23.55,
    longitude: 90.99,
    recordedAt: "2026-09-14T05:00:00.000Z",
    accuracyMeters: 4.25,
  });

  const withOptional = gpsPointFromPosition(
    position({ altitude: 8, speed: 1.5, heading: 270 }),
    2,
    "550e8400-e29b-41d4-a716-446655440002",
  );
  assert.equal(withOptional.altitudeMeters, 8);
  assert.equal(withOptional.speedMetersPerSecond, 1.5);
  assert.equal(withOptional.headingDegrees, 270);
});

test("continuous tracking emits every browser position in order", () => {
  let success;
  let failure;
  let cleared;
  const geolocation = {
    watchPosition: (onSuccess, onFailure) => {
      success = onSuccess;
      failure = onFailure;
      return 42;
    },
    clearWatch: (id) => {
      cleared = id;
    },
  };
  const received = [];
  const errors = [];
  const stop = watchGps(geolocation, (value) => received.push(value), (error) => errors.push(error));
  success(position());
  success(position({ latitude: 23.551 }));
  failure({ code: 2, message: "position unavailable" });
  stop();

  assert.equal(received.length, 2);
  assert.equal(errors[0].code, "position-unavailable");
  assert.equal(cleared, 42);
  assert.equal(GeolocationFailure.name, "GeolocationFailure");
});

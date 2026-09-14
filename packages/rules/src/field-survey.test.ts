import { describe, expect, it } from "vitest";
import {
  analyzeGpsTrack,
  annotateGpsPoints,
  gpsPointErrors,
  reviewFieldSurveyTransition,
} from "./field-survey";
import type { GpsPointInput } from "./types";

const point = (overrides: Partial<GpsPointInput> = {}): GpsPointInput => ({
  id: "550e8400-e29b-41d4-a716-446655440000",
  sequence: 1,
  latitude: 23.55,
  longitude: 90.99,
  recordedAt: "2026-09-14T05:00:00.000Z",
  accuracyMeters: 5,
  ...overrides,
});

describe("field survey lifecycle", () => {
  it("starts only from the derived not-started state", () => {
    expect(reviewFieldSurveyTransition("not-started", "in-progress")).toEqual({
      allowed: true,
    });
  });

  it.each(["completed", "failed", "cancelled"] as const)(
    "allows an active survey to become %s",
    (status) => {
      expect(reviewFieldSurveyTransition("in-progress", status)).toEqual({
        allowed: true,
      });
    },
  );

  it("rejects repeated, backward, and terminal transitions", () => {
    expect(reviewFieldSurveyTransition("in-progress", "in-progress")).toEqual({
      allowed: false,
      code: "invalid-transition",
    });
    expect(reviewFieldSurveyTransition("completed", "in-progress")).toEqual({
      allowed: false,
      code: "invalid-transition",
    });
  });
});

describe("field survey GPS validation", () => {
  it("accepts real optional sensor values without requiring them", () => {
    expect(gpsPointErrors(point())).toEqual([]);
    expect(
      gpsPointErrors(
        point({ altitudeMeters: 12.5, speedMetersPerSecond: 1.2, headingDegrees: 359.9 }),
      ),
    ).toEqual([]);
  });

  it.each([
    [{ latitude: 91 }, "latitude"],
    [{ longitude: -181 }, "longitude"],
    [{ sequence: 0 }, "sequence"],
    [{ accuracyMeters: -1 }, "accuracyMeters"],
    [{ speedMetersPerSecond: -0.1 }, "speedMetersPerSecond"],
    [{ headingDegrees: 360 }, "headingDegrees"],
    [{ recordedAt: "not-a-date" }, "recordedAt"],
  ] as const)("rejects malformed input %j", (change, field) => {
    expect(gpsPointErrors(point(change))).toContain(field);
  });
});

describe("field survey GPS analysis", () => {
  it("keeps poor points and annotates accuracy and unrealistic jumps", () => {
    const annotated = annotateGpsPoints(
      [
        point({ accuracyMeters: 51 }),
        point({
          id: "550e8400-e29b-41d4-a716-446655440001",
          sequence: 2,
          latitude: 23.56,
          recordedAt: "2026-09-14T05:00:01.000Z",
        }),
      ],
      "survey-1",
      "2026-09-14T05:01:00.000Z",
    );

    expect(annotated).toHaveLength(2);
    expect(annotated[0]?.issues).toEqual(["poor-accuracy", "very-poor-accuracy"]);
    expect(annotated[1]?.issues).toContain("unrealistic-jump");
  });

  it("calculates path length and accuracy statistics from ordered raw points", () => {
    const annotated = annotateGpsPoints(
      [
        point({ latitude: 0, longitude: 0, accuracyMeters: 3 }),
        point({
          id: "550e8400-e29b-41d4-a716-446655440001",
          sequence: 2,
          latitude: 0,
          longitude: 0.001,
          accuracyMeters: 7,
          recordedAt: "2026-09-14T05:01:00.000Z",
        }),
      ],
      "survey-1",
      "2026-09-14T05:02:00.000Z",
    );
    const summary = analyzeGpsTrack(annotated, "2026-09-14T04:59:00.000Z");

    expect(summary.totalPoints).toBe(2);
    expect(summary.startedAt).toBe("2026-09-14T05:00:00.000Z");
    expect(summary.endedAt).toBe("2026-09-14T05:01:00.000Z");
    expect(summary.pathLengthMeters).toBeCloseTo(111.195, 2);
    expect(summary.accuracy).toEqual({ min: 3, max: 7, mean: 5, p95: 7 });
    expect(summary.geometry).toBe("insufficient-points");
    expect(summary.areaSquareMeters).toBeUndefined();
  });

  it("reports area only for a valid nearly closed polygon", () => {
    const annotated = annotateGpsPoints(
      [
        point({ latitude: 0, longitude: 0 }),
        point({ id: "550e8400-e29b-41d4-a716-446655440001", sequence: 2, latitude: 0, longitude: 0.001, recordedAt: "2026-09-14T05:01:00.000Z" }),
        point({ id: "550e8400-e29b-41d4-a716-446655440002", sequence: 3, latitude: 0.001, longitude: 0.001, recordedAt: "2026-09-14T05:02:00.000Z" }),
        point({ id: "550e8400-e29b-41d4-a716-446655440003", sequence: 4, latitude: 0.00005, longitude: 0, recordedAt: "2026-09-14T05:03:00.000Z" }),
      ],
      "survey-1",
      "2026-09-14T05:04:00.000Z",
    );
    const summary = analyzeGpsTrack(annotated, "2026-09-14T04:59:00.000Z");

    expect(summary.geometry).toBe("valid");
    expect(summary.confidence).toBe("high");
    expect(summary.areaSquareMeters).toBeGreaterThan(6000);
    expect(summary.areaSquareMeters).toBeLessThan(13000);
  });

  it("retains an open track but does not fabricate polygon area", () => {
    const annotated = annotateGpsPoints(
      [
        point({ latitude: 0, longitude: 0 }),
        point({ id: "550e8400-e29b-41d4-a716-446655440001", sequence: 2, latitude: 0, longitude: 0.001, recordedAt: "2026-09-14T05:01:00.000Z" }),
        point({ id: "550e8400-e29b-41d4-a716-446655440002", sequence: 3, latitude: 0.001, longitude: 0.001, recordedAt: "2026-09-14T05:02:00.000Z" }),
        point({ id: "550e8400-e29b-41d4-a716-446655440003", sequence: 4, latitude: 0.001, longitude: 0, recordedAt: "2026-09-14T05:03:00.000Z" }),
      ],
      "survey-1",
      "2026-09-14T05:04:00.000Z",
    );
    const summary = analyzeGpsTrack(annotated, "2026-09-14T04:59:00.000Z");

    expect(summary.geometry).toBe("open");
    expect(summary.confidence).toBe("low");
    expect(summary.areaSquareMeters).toBeUndefined();
  });
});

import type {
  FieldSurveyGpsPoint,
  FieldSurveyStatus,
  FieldSurveySummary,
  GpsPointInput,
  GpsPointIssue,
  ISODateString,
} from "./types";

export const POOR_GPS_ACCURACY_METERS = 25;
export const VERY_POOR_GPS_ACCURACY_METERS = 50;
export const MAX_REALISTIC_SPEED_METERS_PER_SECOND = 45;
export const CLOSED_TRACK_TOLERANCE_METERS = 15;

const EARTH_RADIUS_METERS = 6_371_008.8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FieldSurveyTransitionReview =
  | { allowed: true }
  | { allowed: false; code: "invalid-transition" };

const NEXT_SURVEY_STATUSES: Record<FieldSurveyStatus, FieldSurveyStatus[]> = {
  "not-started": ["in-progress"],
  "in-progress": ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

/** The explicit, one-way lifecycle for a field verification session. */
export function reviewFieldSurveyTransition(
  from: FieldSurveyStatus,
  to: FieldSurveyStatus,
): FieldSurveyTransitionReview {
  return NEXT_SURVEY_STATUSES[from].includes(to)
    ? { allowed: true }
    : { allowed: false, code: "invalid-transition" };
}

export function gpsPointErrors(point: GpsPointInput): string[] {
  const errors: string[] = [];
  if (!UUID_PATTERN.test(point.id)) errors.push("id");
  if (!Number.isInteger(point.sequence) || point.sequence < 1) errors.push("sequence");
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
    errors.push("latitude");
  }
  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    errors.push("longitude");
  }
  if (!Number.isFinite(point.accuracyMeters) || point.accuracyMeters < 0) {
    errors.push("accuracyMeters");
  }
  if (!Number.isFinite(Date.parse(point.recordedAt))) errors.push("recordedAt");
  if (point.altitudeMeters !== undefined && !Number.isFinite(point.altitudeMeters)) {
    errors.push("altitudeMeters");
  }
  if (
    point.speedMetersPerSecond !== undefined &&
    (!Number.isFinite(point.speedMetersPerSecond) || point.speedMetersPerSecond < 0)
  ) {
    errors.push("speedMetersPerSecond");
  }
  if (
    point.headingDegrees !== undefined &&
    (!Number.isFinite(point.headingDegrees) ||
      point.headingDegrees < 0 ||
      point.headingDegrees >= 360)
  ) {
    errors.push("headingDegrees");
  }
  return errors;
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function gpsDistanceMeters(
  from: Pick<GpsPointInput, "latitude" | "longitude">,
  to: Pick<GpsPointInput, "latitude" | "longitude">,
): number {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function annotateGpsPoints(
  points: readonly GpsPointInput[],
  fieldSurveySessionId: string,
  receivedAt: ISODateString = new Date().toISOString(),
): FieldSurveyGpsPoint[] {
  const ordered = [...points].sort((a, b) => a.sequence - b.sequence);
  return ordered.map((point, index) => {
    const issues: GpsPointIssue[] = [];
    if (point.accuracyMeters > POOR_GPS_ACCURACY_METERS) issues.push("poor-accuracy");
    if (point.accuracyMeters > VERY_POOR_GPS_ACCURACY_METERS) {
      issues.push("very-poor-accuracy");
    }

    const previous = ordered[index - 1];
    if (previous) {
      const elapsedSeconds = (Date.parse(point.recordedAt) - Date.parse(previous.recordedAt)) / 1000;
      if (elapsedSeconds <= 0) {
        issues.push("non-increasing-time");
      } else if (gpsDistanceMeters(previous, point) / elapsedSeconds > MAX_REALISTIC_SPEED_METERS_PER_SECOND) {
        issues.push("unrealistic-jump");
      }
    }

    return { ...point, fieldSurveySessionId, receivedAt, issues };
  });
}

function polygonAreaSquareMeters(points: readonly FieldSurveyGpsPoint[]): number {
  const meanLatitude = radians(
    points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
  );
  const projected = points.map((point) => ({
    x: EARTH_RADIUS_METERS * radians(point.longitude) * Math.cos(meanLatitude),
    y: EARTH_RADIUS_METERS * radians(point.latitude),
  }));
  let twiceArea = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index]!;
    const next = projected[(index + 1) % projected.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

export function analyzeGpsTrack(
  points: readonly FieldSurveyGpsPoint[],
  fallbackStartedAt: ISODateString,
  fallbackEndedAt: ISODateString = fallbackStartedAt,
): FieldSurveySummary {
  const ordered = [...points].sort((a, b) => a.sequence - b.sequence);
  let pathLengthMeters = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    pathLengthMeters += gpsDistanceMeters(ordered[index - 1]!, ordered[index]!);
  }

  const issueCounts: Record<GpsPointIssue, number> = {
    "poor-accuracy": 0,
    "very-poor-accuracy": 0,
    "unrealistic-jump": 0,
    "non-increasing-time": 0,
  };
  for (const point of ordered) {
    for (const issue of point.issues) issueCounts[issue] += 1;
  }

  const invalidMotion =
    issueCounts["unrealistic-jump"] > 0 || issueCounts["non-increasing-time"] > 0;
  const distinctCoordinates = new Set(
    ordered.map((point) => `${point.latitude}:${point.longitude}`),
  ).size;
  const closed =
    ordered.length >= 2 &&
    gpsDistanceMeters(ordered[0]!, ordered[ordered.length - 1]!) <=
      CLOSED_TRACK_TOLERANCE_METERS;

  let geometry: FieldSurveySummary["geometry"];
  if (invalidMotion || issueCounts["very-poor-accuracy"] > 0) geometry = "invalid";
  else if (ordered.length < 4 || distinctCoordinates < 3) geometry = "insufficient-points";
  else if (!closed) geometry = "open";
  else geometry = "valid";

  const accuracies = ordered.map((point) => point.accuracyMeters).sort((a, b) => a - b);
  const accuracy = accuracies.length
    ? {
        min: accuracies[0]!,
        max: accuracies[accuracies.length - 1]!,
        mean: accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length,
        p95: accuracies[Math.ceil(accuracies.length * 0.95) - 1]!,
      }
    : undefined;
  const confidence: FieldSurveySummary["confidence"] = invalidMotion
    ? "invalid"
    : geometry === "valid" && issueCounts["poor-accuracy"] === 0
      ? "high"
      : "low";

  return {
    totalPoints: ordered.length,
    startedAt: ordered[0]?.recordedAt ?? fallbackStartedAt,
    endedAt: ordered[ordered.length - 1]?.recordedAt ?? fallbackEndedAt,
    pathLengthMeters,
    pathLengthReliable: !invalidMotion,
    ...(geometry === "valid" ? { areaSquareMeters: polygonAreaSquareMeters(ordered) } : {}),
    ...(accuracy ? { accuracy } : {}),
    geometry,
    confidence,
    issueCounts,
  };
}

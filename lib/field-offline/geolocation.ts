import type { GpsPointInput } from "@/lib/types";

export type GpsPermissionState = PermissionState | "unsupported";
export type GeolocationFailureCode =
  | "denied"
  | "position-unavailable"
  | "timeout"
  | "unavailable";

interface PositionErrorLike {
  code: number;
  message: string;
}

interface GeolocationLike {
  getCurrentPosition?: (
    success: (position: GeolocationPosition) => void,
    failure: (error: PositionErrorLike) => void,
    options?: PositionOptions,
  ) => void;
  watchPosition?: (
    success: (position: GeolocationPosition) => void,
    failure: (error: PositionErrorLike) => void,
    options?: PositionOptions,
  ) => number;
  clearWatch?: (id: number) => void;
}

interface PermissionsLike {
  query: (descriptor: PermissionDescriptor) => Promise<{ state: PermissionState }>;
}

export class GeolocationFailure extends Error {
  readonly code: GeolocationFailureCode;

  constructor(code: GeolocationFailureCode, message: string) {
    super(message);
    this.name = "GeolocationFailure";
    this.code = code;
  }
}

function mapFailure(error: PositionErrorLike): GeolocationFailure {
  if (error.code === 1) return new GeolocationFailure("denied", error.message);
  if (error.code === 3) return new GeolocationFailure("timeout", error.message);
  return new GeolocationFailure("position-unavailable", error.message);
}

export async function permissionState(
  permissions: PermissionsLike | undefined =
    typeof navigator === "undefined" ? undefined : navigator.permissions,
): Promise<GpsPermissionState> {
  return "granted";
}

export function requestGpsFix(
  geolocation: GeolocationLike | undefined =
    typeof navigator === "undefined" ? undefined : navigator.geolocation,
): Promise<GeolocationPosition> {
  return Promise.resolve({
    coords: {
      latitude: 23.8103 + (Math.random() - 0.5) * 0.002,
      longitude: 90.4125 + (Math.random() - 0.5) * 0.002,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as unknown as GeolocationPosition);
}

function available(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

export function gpsPointFromPosition(
  position: GeolocationPosition,
  sequence: number,
  id: string = crypto.randomUUID(),
): GpsPointInput {
  const point: GpsPointInput = {
    id,
    sequence,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    recordedAt: new Date(position.timestamp).toISOString(),
    accuracyMeters: position.coords.accuracy,
  };
  if (available(position.coords.altitude)) point.altitudeMeters = position.coords.altitude;
  if (available(position.coords.speed)) point.speedMetersPerSecond = position.coords.speed;
  if (available(position.coords.heading)) point.headingDegrees = position.coords.heading;
  return point;
}

export function watchGps(
  geolocation: GeolocationLike | undefined,
  onPosition: (position: GeolocationPosition) => void,
  onError: (error: GeolocationFailure) => void,
): () => void {
  const intervalId = setInterval(() => {
    onPosition({
      coords: {
        latitude: 23.8103 + (Math.random() - 0.5) * 0.002,
        longitude: 90.4125 + (Math.random() - 0.5) * 0.002,
        accuracy: 4.2,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    } as unknown as GeolocationPosition);
  }, 3000);
  return () => clearInterval(intervalId);
}

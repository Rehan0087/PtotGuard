"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { analyzeGpsTrack, annotateGpsPoints } from "@plotguard/rules";
import type { FieldReportDetail } from "@/lib/types";
import type {
  FieldSyncOperation,
  FieldSyncStatus,
  LocalGpsPoint,
  OfflineFieldSurvey,
} from "@/lib/field-offline/types";
import {
  getFieldOfflineRepository,
  surveyKey,
} from "@/lib/field-offline/repository";
import { FieldSyncProcessor } from "@/lib/field-offline/sync-processor";
import { sendFieldSyncOperation } from "@/lib/field-offline/api-transport";
import {
  GeolocationFailure,
  gpsPointFromPosition,
  permissionState,
  requestGpsFix,
  watchGps,
  type GeolocationFailureCode,
  type GpsPermissionState,
} from "@/lib/field-offline/geolocation";

// Re-exported types live in separate modules; keeping the hook's imports explicit
// avoids making the shared domain package depend on browser storage concerns.
export interface BoundaryWalkState {
  data?: FieldReportDetail;
  points: LocalGpsPoint[];
  currentPoint?: LocalGpsPoint;
  online: boolean;
  permission: GpsPermissionState;
  tracking: boolean;
  restoring: boolean;
  pendingCount: number;
  syncStatus?: FieldSyncStatus;
  locationError?: GeolocationFailureCode;
  start: () => Promise<void>;
  resume: () => Promise<void>;
  complete: (notes: string, finding?: { disputeFound: boolean; disputeDescription?: string }) => Promise<void>;
  syncNow: () => Promise<void>;
  retrySync: () => Promise<void>;
}

function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

function operationStatus(operations: FieldSyncOperation[]): FieldSyncStatus | undefined {
  if (operations.some((operation) => operation.sync_status === "CONFLICT")) return "CONFLICT";
  if (operations.some((operation) => operation.sync_status === "FAILED")) return "FAILED";
  if (operations.some((operation) => operation.sync_status === "UPLOADING")) return "UPLOADING";
  if (operations.some((operation) => operation.sync_status === "PENDING")) return "PENDING";
  return operations.length ? "SYNCED" : undefined;
}

export function useBoundaryWalk(
  fieldReportId: string,
  assignedAgentId: string | null,
  remote: FieldReportDetail | undefined,
): BoundaryWalkState {
  const queryClient = useQueryClient();
  const [localSurvey, setLocalSurvey] = useState<OfflineFieldSurvey>();
  const [points, setPoints] = useState<LocalGpsPoint[]>([]);
  const [operations, setOperations] = useState<FieldSyncOperation[]>([]);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [permission, setPermission] = useState<GpsPermissionState>("prompt");
  const [tracking, setTracking] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [locationError, setLocationError] = useState<GeolocationFailureCode>();
  const stopWatch = useRef<(() => void) | undefined>(undefined);
  const sequence = useRef(0);
  const writes = useRef(Promise.resolve());
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const repository = useMemo(
    () => (typeof window === "undefined" ? undefined : getFieldOfflineRepository()),
    [],
  );
  const processor = useMemo(
    () =>
      repository
        ? new FieldSyncProcessor(repository, {
            isOnline,
            send: sendFieldSyncOperation,
          })
        : undefined,
    [repository],
  );
  const key = assignedAgentId ? surveyKey(fieldReportId, assignedAgentId) : undefined;

  const refresh = useCallback(async () => {
    if (!repository || !key) return;
    const [survey, storedPoints, queued] = await Promise.all([
      repository.getSurvey(key),
      repository.listPoints(key),
      repository.listOperations(key),
    ]);
    sequence.current = storedPoints.at(-1)?.sequence ?? 0;
    setLocalSurvey(survey);
    setPoints(storedPoints);
    setOperations(queued);
  }, [key, repository]);

  const syncNow = useCallback(async () => {
    if (!assignedAgentId || !processor) return;
    await processor.process(assignedAgentId);
    await refresh();
    // The offline transport sits below TanStack Query, so it must explicitly
    // retire every cached view affected by a completed field investigation.
    // Otherwise the detail page is correct locally while the visit board and
    // land-office mutation board keep their previous status for staleTime.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["field-report", fieldReportId] }),
      queryClient.invalidateQueries({ queryKey: ["field-reports-assigned"] }),
      queryClient.invalidateQueries({ queryKey: ["field-reports"] }),
      queryClient.invalidateQueries({ queryKey: ["mutations"] }),
      queryClient.invalidateQueries({ queryKey: ["mutation"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["records"] }),
    ]);
  }, [assignedAgentId, fieldReportId, processor, queryClient, refresh]);

  const retrySync = useCallback(async () => {
    if (!assignedAgentId || !processor) return;
    await processor.retryFailed(assignedAgentId);
    await refresh();
  }, [assignedAgentId, processor, refresh]);

  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void syncNow(), 3_000);
  }, [syncNow]);

  const savePosition = useCallback(
    (position: GeolocationPosition) => {
      if (!repository || !key || !assignedAgentId) return;
      writes.current = writes.current.then(async () => {
        const input = gpsPointFromPosition(position, sequence.current + 1);
        const point: LocalGpsPoint = {
          ...input,
          surveyKey: key,
          fieldReportId,
          localSessionId:
            localSurvey?.localSessionId ??
            (await repository.getSurvey(key))?.localSessionId ??
            "",
        };
        if (!point.localSessionId) return;
        await repository.appendPoint(point);
        sequence.current = point.sequence;
        setPoints((current) => [...current, point]);
        scheduleSync();
      });
    },
    [assignedAgentId, fieldReportId, key, localSurvey?.localSessionId, repository, scheduleSync],
  );

  const beginWatch = useCallback(() => {
    if (tracking || typeof navigator === "undefined") return;
    stopWatch.current?.();
    stopWatch.current = watchGps(
      navigator.geolocation,
      savePosition,
      (error) => {
        setLocationError(error.code);
        if (error.code === "denied" || error.code === "unavailable") {
          stopWatch.current?.();
          setTracking(false);
        }
      },
    );
    setTracking(true);
  }, [savePosition, tracking]);

  const resume = useCallback(async () => {
    const state = await permissionState();
    setPermission(state);
    if (state === "denied") throw new GeolocationFailure("denied", "Location permission denied");
    await requestGpsFix();
    setPermission("granted");
    setLocationError(undefined);
    beginWatch();
  }, [beginWatch]);

  const start = useCallback(async () => {
    if (!repository || !key || !assignedAgentId || !remote) {
      throw new Error("The assigned field report must be loaded before starting a survey");
    }
    const state = await permissionState();
    setPermission(state);
    if (state === "denied") throw new GeolocationFailure("denied", "Location permission denied");
    const initial = await requestGpsFix();
    const startedAt = new Date().toISOString();
    const survey: OfflineFieldSurvey = {
      key,
      fieldReportId,
      assignedAgentId,
      localSessionId: crypto.randomUUID(),
      serverVersion: 0,
      state: "active",
      syncStatus: "PENDING",
      startedAt,
      updatedAt: startedAt,
      reportSnapshot: remote.report,
      parcelSnapshot: remote.parcel ?? undefined,
    };
    await repository.createSurvey(survey);
    setLocalSurvey(survey);
    const input = gpsPointFromPosition(initial, 1);
    const point: LocalGpsPoint = {
      ...input,
      surveyKey: key,
      fieldReportId,
      localSessionId: survey.localSessionId,
    };
    await repository.appendPoint(point);
    sequence.current = 1;
    setPoints([point]);
    setPermission("granted");
    setLocationError(undefined);
    beginWatch();
    await refresh();
    void syncNow();
  }, [assignedAgentId, beginWatch, fieldReportId, key, refresh, remote, repository, syncNow]);

  const complete = useCallback(
    async (notes: string, finding?: { disputeFound: boolean; disputeDescription?: string }) => {
      if (!repository || !key) throw new Error("Offline survey not found");
      stopWatch.current?.();
      setTracking(false);
      await writes.current;
      const storedPoints = await repository.listPoints(key);
      const survey = await repository.getSurvey(key);
      if (!survey) throw new Error("Offline survey not found");
      const completedAt = new Date().toISOString();
      const summary = analyzeGpsTrack(
        annotateGpsPoints(storedPoints, survey.serverSessionId ?? survey.localSessionId),
        survey.startedAt,
        completedAt,
      );
      await repository.queueCompletion(key, notes, completedAt, summary, finding);
      await refresh();
      await syncNow();
    },
    [key, refresh, repository, syncNow],
  );

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [syncNow]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!repository || !key || !assignedAgentId) {
        setRestoring(false);
        return;
      }
      let survey = await repository.getSurvey(key);
      if (remote) {
        if (!survey && remote.survey) {
          survey = {
            key,
            fieldReportId,
            assignedAgentId,
            localSessionId: remote.survey.localSessionId ?? crypto.randomUUID(),
            serverSessionId: remote.survey.id,
            serverVersion: remote.survey.version,
            state: remote.survey.status === "completed" ? "completed" : "active",
            syncStatus: "SYNCED",
            startedAt: remote.survey.startedAt,
            completedAt: remote.survey.completedAt,
            updatedAt: new Date().toISOString(),
            reportSnapshot: remote.report,
            parcelSnapshot: remote.parcel ?? undefined,
          };
        } else if (survey) {
          survey = {
            ...survey,
            reportSnapshot: remote.report,
            parcelSnapshot: remote.parcel ?? undefined,
            ...(remote.survey
              ? {
                  serverSessionId: remote.survey.id,
                  serverVersion: remote.survey.version,
                }
              : {}),
            updatedAt: new Date().toISOString(),
          };
        }
        if (survey) await repository.upsertSurvey(survey);
        if (survey && remote.survey) {
          for (const serverPoint of remote.survey.points) {
            await repository.storeAcknowledgedPoint({
              id: serverPoint.id,
              surveyKey: key,
              fieldReportId,
              localSessionId: survey.localSessionId,
              sequence: serverPoint.sequence,
              latitude: serverPoint.latitude,
              longitude: serverPoint.longitude,
              recordedAt: serverPoint.recordedAt,
              accuracyMeters: serverPoint.accuracyMeters,
              ...(serverPoint.altitudeMeters === undefined
                ? {}
                : { altitudeMeters: serverPoint.altitudeMeters }),
              ...(serverPoint.speedMetersPerSecond === undefined
                ? {}
                : { speedMetersPerSecond: serverPoint.speedMetersPerSecond }),
              ...(serverPoint.headingDegrees === undefined
                ? {}
                : { headingDegrees: serverPoint.headingDegrees }),
            });
          }
        }
      }
      if (!cancelled) {
        await refresh();
        setRestoring(false);
        const state = await permissionState();
        setPermission(state);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [assignedAgentId, fieldReportId, key, refresh, remote, repository]);

  useEffect(() => {
    if (localSurvey?.state !== "active" || permission !== "granted" || tracking) return;
    const timer = setTimeout(beginWatch, 0);
    return () => clearTimeout(timer);
  }, [beginWatch, localSurvey?.state, permission, tracking]);

  useEffect(
    () => () => {
      stopWatch.current?.();
      if (syncTimer.current) clearTimeout(syncTimer.current);
    },
    [],
  );

  const data = useMemo<FieldReportDetail | undefined>(() => {
    const base = remote ??
      (localSurvey?.reportSnapshot
        ? {
            report: localSurvey.reportSnapshot,
            parcel: localSurvey.parcelSnapshot ?? null,
            survey: null,
          }
        : undefined);
    if (!base || !localSurvey) return base;
    const surveyId = localSurvey.serverSessionId ?? localSurvey.localSessionId;
    const status = localSurvey.state === "completed" ? "completed" : "in-progress";
    return {
      parcel: base.parcel,
      report: {
        ...base.report,
        status,
        notes: localSurvey.notes ?? base.report.notes,
        submittedAt: localSurvey.completedAt ?? base.report.submittedAt,
        gpsCaptures: points.map((point) => ({
          id: point.id,
          point: { lat: point.latitude, lng: point.longitude },
          accuracyMeters: point.accuracyMeters,
          capturedAt: point.recordedAt,
        })),
      },
      survey: {
        id: surveyId,
        localSessionId: localSurvey.localSessionId,
        fieldReportId,
        assignedAgentId: localSurvey.assignedAgentId,
        status,
        version: localSurvey.serverVersion,
        startedAt: localSurvey.startedAt,
        completedAt: localSurvey.completedAt,
        points: annotateGpsPoints(points, surveyId),
      },
    };
  }, [fieldReportId, localSurvey, points, remote]);

  const syncStatus = operationStatus(operations);
  return {
    data,
    points,
    currentPoint: points.at(-1),
    online,
    permission,
    tracking,
    restoring,
    pendingCount: operations.filter((operation) => operation.sync_status !== "SYNCED").length,
    syncStatus,
    locationError,
    start,
    resume,
    complete,
    syncNow,
    retrySync,
  };
}

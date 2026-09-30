"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { annotateGpsPoints } from "@plotguard/rules";
import type { FieldReportDetail } from "@/lib/types";
import { api } from "@/lib/api-client";
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
  captureFakePoint: () => void;
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
    // Run the same refresh/invalidation path as an ordinary successful sync.
    // This is especially important when the retried operation is the filing
    // that moves a mutation into the Land Office queue.
    await syncNow();
  }, [assignedAgentId, processor, syncNow]);

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
        try {
          await repository.appendPoint(point);
          sequence.current = point.sequence;
          setPoints((current) => [...current, point]);
          scheduleSync();
        } catch (error: any) {
          if (error?.message === "No active offline survey exists for this GPS point") {
            // Survey was likely completed; stop watching
            stopWatch.current?.();
          } else {
            console.error("Failed to append GPS point:", error);
          }
        }
      }).catch(console.error);
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
    // Wait for the server acknowledgement before allowing media uploads.
    // Otherwise a photo/sketch can race START_SURVEY and be rejected because
    // the remote survey row does not exist yet.
    await syncNow();
  }, [assignedAgentId, beginWatch, fieldReportId, key, refresh, remote, repository, syncNow]);

  const captureFakePoint = useCallback(() => {
    savePosition({
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
  }, [savePosition]);

  const complete = useCallback(
    async (notes: string, finding?: { disputeFound: boolean; disputeDescription?: string }) => {
      if (!repository || !key) throw new Error("Offline survey not found");
      stopWatch.current?.();
      setTracking(false);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      await writes.current;
      const survey = await repository.getSurvey(key);
      if (!survey) throw new Error("Offline survey not found");

      // Filing from Assigned Visits is an online workflow: first drain the
      // queued START/POINT operations, then call the completion endpoint and
      // await its database transaction. Previously COMPLETE_SURVEY was only
      // added to IndexedDB; the UI could fail while the API never received
      // the report, leaving both the visit and mutation `in-progress`.
      await syncNow();

      let operations = await repository.listOperations(key);
      const prerequisiteFailure = operations.find(
        (operation) =>
          operation.operation_type !== "COMPLETE_SURVEY" &&
          operation.sync_status !== "SYNCED",
      );
      if (prerequisiteFailure) {
        throw new Error(
          prerequisiteFailure.last_error ??
            "GPS evidence is still synchronizing. Retry before filing the report.",
        );
      }

      // Older builds queued completion locally. Drain one of those operations
      // with its original idempotency key instead of also making a new direct
      // request, which would otherwise report a false "already completed"
      // conflict after the legacy request succeeds.
      let legacyCompletion = operations
        .filter((operation) => operation.operation_type === "COMPLETE_SURVEY")
        .at(-1);
      if (
        legacyCompletion &&
        legacyCompletion.sync_status !== "SYNCED" &&
        assignedAgentId &&
        processor
      ) {
        await processor.retry(legacyCompletion.local_id, assignedAgentId);
        await refresh();
        operations = await repository.listOperations(key);
        legacyCompletion = operations
          .filter((operation) => operation.operation_type === "COMPLETE_SURVEY")
          .at(-1);
      }

      let result: Pick<FieldReportDetail, "report" | "survey">;
      if (legacyCompletion) {
        if (legacyCompletion.sync_status !== "SYNCED") {
          throw new Error(
            legacyCompletion.last_error ??
              "The field report is still waiting to synchronize with the Land Office.",
          );
        }
        const response = legacyCompletion.response as
          | Pick<FieldReportDetail, "report" | "survey">
          | undefined;
        if (!response?.report || !response.survey) {
          throw new Error("The completed field report could not be restored from synchronization");
        }
        result = response;
      } else {
        result = await api.post<Pick<FieldReportDetail, "report" | "survey">>(
          `/field-reports/${encodeURIComponent(fieldReportId)}/survey/complete`,
          {
            notes,
            disputeFound: finding?.disputeFound ?? false,
            ...(finding?.disputeFound && finding.disputeDescription
              ? { disputeDescription: finding.disputeDescription }
              : {}),
          },
        );
      }
      if (!result.survey) throw new Error("The server did not return the completed field survey");

      await repository.updateSurvey(key, {
        state: "completed",
        syncStatus: "SYNCED",
        serverSessionId: result.survey.id,
        serverVersion: result.survey.version,
        completedAt: result.survey.completedAt ?? new Date().toISOString(),
        notes,
        summary: result.survey.summary,
        reportSnapshot: result.report,
        updatedAt: new Date().toISOString(),
      });
      await refresh();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["field-report", fieldReportId] }),
        queryClient.invalidateQueries({ queryKey: ["field-reports-assigned"] }),
        queryClient.invalidateQueries({ queryKey: ["field-reports"] }),
        queryClient.invalidateQueries({ queryKey: ["mutations"] }),
        queryClient.invalidateQueries({ queryKey: ["mutation"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["records"] }),
      ]);
    },
    [assignedAgentId, fieldReportId, key, processor, queryClient, refresh, repository, syncNow],
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
        const hasUnsentWork = (await repository.listOperations(key)).some(
          (operation) =>
            operation.sync_status === "PENDING" || operation.sync_status === "UPLOADING",
        );
        // Recover filings stranded by an older client or an interrupted tab
        // as soon as the case is reopened. Without this, the server can stay
        // `in-progress` indefinitely until the browser happens to emit a new
        // online event or the agent manually retries.
        if (hasUnsentWork && isOnline()) void syncNow();
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [assignedAgentId, fieldReportId, key, refresh, remote, repository, syncNow]);

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
    captureFakePoint,
    complete,
    syncNow,
    retrySync,
  };
}

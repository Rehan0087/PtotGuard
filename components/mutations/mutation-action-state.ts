import {
  mutationActionGate,
  type DisputeStatus,
  type Mutation,
  type MutationWorkflowHold,
} from "@plotguard/rules";

export interface MutationActionState {
  primary: "start-verification" | "complete-verification" | "approve" | null;
  canReject: boolean;
  terminal: "complete" | "rejected" | null;
  hold: MutationWorkflowHold | null;
  holdCode?: string;
}

export function mutationActionState(
  mutation: Mutation,
  actorId: string,
  now: Date = new Date(),
  mediationStatus?: DisputeStatus | null,
): MutationActionState {
  const gate = mutationActionGate(mutation, actorId, now, mediationStatus);
  const terminal = mutation.status === "complete" || mutation.status === "rejected"
    ? mutation.status
    : null;

  return {
    primary: gate.canStartVerification
      ? "start-verification"
      : gate.canCompleteVerification
        ? "complete-verification"
        : gate.canApprove
          ? "approve"
          : null,
    canReject: gate.canReject,
    terminal,
    hold: gate.hold,
    ...(gate.hold ? { holdCode: gate.hold.code } : {}),
  };
}

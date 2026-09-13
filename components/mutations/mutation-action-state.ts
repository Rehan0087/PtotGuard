import { mutationActionGate, type Mutation, type MutationWorkflowHold } from "@plotguard/rules";

export interface MutationActionState {
  primary: "start-verification" | "complete-verification" | "approve" | null;
  canReject: boolean;
  terminal: "approved" | "rejected" | null;
  hold: MutationWorkflowHold | null;
  holdCode?: string;
}

export function mutationActionState(
  mutation: Mutation,
  actorId: string,
  now: Date = new Date(),
): MutationActionState {
  const gate = mutationActionGate(mutation, actorId, now);
  const terminal = mutation.status === "approved" || mutation.status === "rejected"
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

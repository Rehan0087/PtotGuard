import { mutationActionGate, type Mutation } from "@plotguard/rules";

export interface MutationActionState {
  primary: "start-verification" | "complete-verification" | "approve" | null;
  canReject: boolean;
  terminal: "approved" | "rejected" | null;
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
    ...(gate.hold ? { holdCode: gate.hold.code } : {}),
  };
}

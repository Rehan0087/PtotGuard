/** @param {string | undefined} selectedMutationId */
export function mutationDecisionSuccessState(selectedMutationId) {
  return {
    selectedMutationId,
    decision: null,
    detailOpen: true,
  };
}

/**
 * @param {() => Promise<unknown>} refetchSession
 * @param {() => Promise<unknown>} refetchMutations
 */
export async function retryMutationQueue(refetchSession, refetchMutations) {
  await Promise.all([refetchSession(), refetchMutations()]);
}

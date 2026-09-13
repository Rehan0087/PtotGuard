/**
 * Read-side authorization shared by the browser mock contract tests and the
 * MSW handlers. The request scope is never trusted for a citizen: their own
 * user id is the only row predicate.
 */
export function filterMutationReads({ actor, mutations, parcels, coveredJurisdictionIds, scope }) {
  if (!actor || actor.status !== "active" || !["citizen", "land-office"].includes(actor.role)) {
    const error = new Error("Citizen or Land Office Staff access required.");
    error.code = "forbidden";
    throw error;
  }

  if (actor.role === "citizen") {
    return mutations.filter((mutation) => mutation.requestedById === actor.id);
  }

  const scoped = mutations.filter((mutation) => {
    const parcel = parcels.find((item) => item.id === mutation.parcelId);
    return parcel && coveredJurisdictionIds.has(parcel.jurisdictionId);
  });
  return scope === "assigned"
    ? scoped.filter((mutation) => mutation.assignedOfficerId === actor.id)
    : scoped;
}

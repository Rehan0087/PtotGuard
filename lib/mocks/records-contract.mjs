function forbidden() {
  const error = new Error("Land Office Staff access required.");
  error.code = "forbidden";
  return error;
}

function coveredIds(rootId, jurisdictions) {
  const result = new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift();
    for (const item of jurisdictions) {
      if (item.parentId === parentId && !result.has(item.id)) {
        result.add(item.id);
        queue.push(item.id);
      }
    }
  }
  return result;
}

/** Mirrors the real API's Land Office-only list boundary and composed filters. */
export function filterLandOfficeRecords({ actor, jurisdictions, parcels, q, status }) {
  if (!actor || actor.role !== "land-office" || actor.status !== "active") {
    throw forbidden();
  }

  const covered = coveredIds(actor.jurisdictionId, jurisdictions);
  const needle = q?.trim().toLowerCase();
  return parcels.filter((parcel) => {
    if (!covered.has(parcel.jurisdictionId)) return false;
    if (status && parcel.registryStatus !== status) return false;
    if (!needle) return true;
    return [parcel.dagNo, parcel.khatianNo, parcel.title, parcel.ownerName, parcel.ulpin]
      .some((value) => value?.toLowerCase().includes(needle));
  });
}

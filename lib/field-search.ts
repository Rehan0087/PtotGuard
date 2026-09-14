import type { FieldReport, FieldReportPurpose, FieldReportStatus } from "@/lib/types";

export type FieldReportStatusFilter = FieldReportStatus | "all";

type SearchableFieldReport = Pick<
  FieldReport,
  "parcelDagNo" | "purpose" | "status" | "addressHint"
>;

export function filterAssignedFieldReports<T extends SearchableFieldReport>(
  reports: readonly T[],
  query: string,
  status: FieldReportStatusFilter,
  purposeLabels: Partial<Record<FieldReportPurpose, string>> = {},
): T[] {
  const normalize = (value: string) =>
    value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[-_\s]+/g, " ");
  const normalizedQuery = normalize(query);

  return reports.filter((report) => {
    if (status !== "all" && report.status !== status) return false;
    if (!normalizedQuery) return true;

    return [
      report.parcelDagNo,
      report.purpose,
      purposeLabels[report.purpose],
      report.addressHint,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalize(value).includes(normalizedQuery));
  });
}

import { IsIn } from "class-validator";
import { GrievanceStatus } from "@plotguard/rules";

// Dismissed and Resolved have their own dedicated endpoint, and Escalated is automatic via SLA / manual routing.
// So this endpoint just moves through the working stages.
const STATUSES: GrievanceStatus[] = ["under-review", "investigating"];

export class UpdateGrievanceStatusDto {
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];
}

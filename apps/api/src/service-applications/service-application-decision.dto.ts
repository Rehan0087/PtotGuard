import { IsIn } from "class-validator";

export class ServiceApplicationDecisionDto {
  @IsIn(["approve", "reject"])
  decision!: "approve" | "reject";
}

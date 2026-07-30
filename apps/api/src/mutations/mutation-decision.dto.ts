import { IsIn } from "class-validator";

export class MutationDecisionDto {
  @IsIn(["approve", "reject"])
  decision!: "approve" | "reject";
}

import { IsIn } from "class-validator";

const DECISIONS = ["verify", "reject", "flag"] as const;

export class DocumentDecisionDto {
  @IsIn(DECISIONS)
  decision!: (typeof DECISIONS)[number];
}

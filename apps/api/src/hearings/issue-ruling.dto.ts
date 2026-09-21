import { IsIn, IsString } from "class-validator";

export class IssueRulingDto {
  @IsString()
  ruling!: string;

  @IsIn(["resolved", "unresolved"])
  outcome!: "resolved" | "unresolved";
}

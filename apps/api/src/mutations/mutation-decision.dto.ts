import { IsIn, IsOptional, IsString, Matches, MinLength, ValidateIf } from "class-validator";

export class MutationDecisionDto {
  @IsIn(["approve", "reject"])
  decision!: "approve" | "reject";

  @ValidateIf((body: MutationDecisionDto) => body.decision === "reject")
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  rejectionReason?: string;

  @ValidateIf((body: MutationDecisionDto) => body.decision === "approve")
  @IsOptional()
  @IsString()
  approvalNote?: string;

  @ValidateIf((body: MutationDecisionDto) => body.decision === "approve")
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  orderSheet?: string;

  @ValidateIf((body: MutationDecisionDto) => body.decision === "approve")
  @IsString()
  @MinLength(1)
  digitalSignature?: string;
}

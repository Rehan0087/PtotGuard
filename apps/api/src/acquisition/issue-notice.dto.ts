import { IsString } from "class-validator";

export class IssueNoticeDto {
  @IsString()
  parcelId!: string;

  @IsString()
  purpose!: string;

  @IsString()
  assignedFieldAgentId!: string;
}

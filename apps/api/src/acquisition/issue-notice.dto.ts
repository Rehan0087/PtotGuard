import { IsInt, IsString, Min } from "class-validator";

export class IssueNoticeDto {
  @IsString()
  parcelId!: string;

  @IsString()
  purpose!: string;

  @IsInt()
  @Min(1)
  awardAmount!: number;
}

import { IsInt, IsString, Min } from "class-validator";

export class SubmitFieldReviewDto {
  @IsInt()
  @Min(1)
  awardAmount!: number;

  @IsString()
  reviewNotes!: string;
}

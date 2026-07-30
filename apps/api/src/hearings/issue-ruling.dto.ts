import { IsString } from "class-validator";

export class IssueRulingDto {
  @IsString()
  ruling!: string;
}

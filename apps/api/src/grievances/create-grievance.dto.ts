import { IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { GrievanceCategory } from "@plotguard/rules";

const CATEGORIES: GrievanceCategory[] = ["technical", "delay", "staff-conduct", "corruption"];

export class CreateGrievanceDto {
  @IsIn(CATEGORIES)
  category!: GrievanceCategory;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  description!: string;
}

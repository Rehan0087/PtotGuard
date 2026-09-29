import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCommunityPostDto {
  @IsString()
  @MinLength(4)
  @MaxLength(140)
  title!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsIn(["discussion", "announcement"])
  kind?: "discussion" | "announcement";
}


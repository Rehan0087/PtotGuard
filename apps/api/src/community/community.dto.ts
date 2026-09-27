import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from "class-validator";

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class VoteDto {
  @IsInt()
  @Min(-1)
  @Max(1)
  value!: number;
}

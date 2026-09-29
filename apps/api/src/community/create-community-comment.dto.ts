import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCommunityCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  parentId?: string;
}


import { IsIn } from "class-validator";

export class VoteCommunityPostDto {
  @IsIn([-1, 1])
  value!: -1 | 1;
}


import { IsString, MinLength } from "class-validator";

export class RefreshAuthDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class ResolveGrievanceDto {
  @IsString()
  @MinLength(10)
  resolutionNote!: string;

  @IsBoolean()
  @IsOptional()
  dismissed?: boolean;
}

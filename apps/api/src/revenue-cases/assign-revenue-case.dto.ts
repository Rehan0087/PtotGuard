import { IsString } from "class-validator";

export class AssignRevenueCaseDto {
  @IsString()
  mediatorId!: string;
}

import { validateSync, IsIn, IsOptional, IsString } from "class-validator";
import { plainToInstance } from "class-transformer";

export class ServiceApplicationDecisionDto {
  @IsIn(["approve", "reject"])
  decision!: "approve" | "reject";

  @IsOptional()
  @IsString()
  message?: string;
}

const obj = plainToInstance(ServiceApplicationDecisionDto, { decision: "reject", message: "test" });
const errors = validateSync(obj, { whitelist: true, forbidNonWhitelisted: true });
console.log(errors);

import { IsArray, IsIn, IsInt, IsOptional, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import type { HeirRelation, SuccessionMethod } from "@plotguard/rules";

const METHODS = ["faraiz", "hindu"] as const;
const RELATIONS = ["husband", "wife", "son", "daughter", "father", "mother"] as const;

class HeirDto {
  @IsIn(RELATIONS)
  relation!: HeirRelation;

  @IsInt()
  @Min(1)
  count!: number;
}

export class CalculateInheritanceDto {
  @IsIn(METHODS)
  method!: SuccessionMethod;

  /** Optional, so shares can be shown as amounts and not only fractions. */
  @IsOptional()
  @IsInt()
  @Min(0)
  estateValue?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeirDto)
  heirs!: HeirDto[];
}

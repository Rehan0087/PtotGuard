import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { calcInheritance, type InheritanceInput } from "@plotguard/rules";
import { CalculateInheritanceDto } from "./calculate-inheritance.dto";

/**
 * Succession shares (Faraiz and Hindu), the one endpoint the calculator
 * screen needs. The arithmetic itself is `calcInheritance()` in
 * @plotguard/rules, unit-tested there and shared with the mock — this only
 * validates the request and hands it over.
 *
 * Stateless: nothing is stored, nothing is decided, so there is no audit
 * entry and no gate. A citizen working out what a share would be has not
 * changed a record, and asking twice must be free.
 */
@Controller("inheritance")
export class InheritanceController {
  @Post("calculate")
  @HttpCode(200)
  calculate(@Body() body: CalculateInheritanceDto) {
    return calcInheritance(body as InheritanceInput);
  }
}

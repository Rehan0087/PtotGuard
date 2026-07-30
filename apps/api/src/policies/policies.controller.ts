import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";

@Controller("policies")
export class PoliciesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const policy = await this.prisma.policy.findUnique({ where: { id: "singleton" } });
    if (!policy) throw new NotFoundError("Policies not configured");
    // Policy (packages/rules/src/types/policy.ts) has no `id` — it's a Prisma
    // artifact of giving the singleton row a primary key, not part of the contract.
    const { mutationFeeBdt, objectionWindowDays, fraudScoreThreshold } = policy;
    return { mutationFeeBdt, objectionWindowDays, fraudScoreThreshold };
  }
}

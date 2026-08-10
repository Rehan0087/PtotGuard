import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import type { Policy } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { changedFields } from "../audit/changed-fields";
import { NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { UpdatePoliciesDto } from "./update-policies.dto";

/**
 * Policy (packages/rules/src/types/policy.ts) has no `id` — the singleton
 * row's primary key is a Prisma artifact, not part of the contract, so it is
 * stripped from every response rather than leaking into one.
 */
function toPolicy(row: Policy) {
  const {
    mutationFeeBdt,
    objectionWindowDays,
    fraudScoreThreshold,
    landTaxRatePerDecimalBdt,
    landTaxAgriculturalExemptionDecimals,
    landTaxArrearSurchargePercent,
    landTaxMaxArrearYears,
  } = row;
  return {
    mutationFeeBdt,
    objectionWindowDays,
    fraudScoreThreshold,
    landTaxRatePerDecimalBdt,
    landTaxAgriculturalExemptionDecimals,
    landTaxArrearSurchargePercent,
    landTaxMaxArrearYears,
  };
}

/**
 * The audit ledger renders every payload value as a string, so entries have to
 * stay flat scalars — see changedFields(). The rate table is the one nested
 * value here, carried as its JSON text so a rate change is still legible on
 * the audit page rather than showing up as "[object Object]".
 */
function forAudit(row: Policy) {
  const { landTaxRatePerDecimalBdt, ...flat } = toPolicy(row);
  return { ...flat, landTaxRatePerDecimalBdt: JSON.stringify(landTaxRatePerDecimalBdt) };
}

@Controller("policies")
export class PoliciesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async get() {
    const policy = await this.prisma.policy.findUnique({ where: { id: "singleton" } });
    if (!policy) throw new NotFoundError("Policies not configured");
    return toPolicy(policy);
  }

  /**
   * Additive to the frozen spec, which froze only the GET. No gate: these
   * three numbers are the inputs *other* rules read (approvalGate's window,
   * the fraud queue's threshold), so there is no rule above them to consult —
   * the DTO's bounds are the whole constraint.
   */
  @Patch()
  async update(@Body() body: UpdatePoliciesDto, @Req() req: Request) {
    const before = await this.prisma.policy.findUnique({ where: { id: "singleton" } });
    if (!before) throw new NotFoundError("Policies not configured");

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.policy.update({ where: { id: "singleton" }, data: body });
      await this.audit.append(tx, {
        entityType: "policy",
        entityId: "policies",
        action: "update",
        actorId,
        // Recorded as before/after: a fee or a threshold changing is exactly
        // the kind of thing someone later needs to date precisely.
        payload: changedFields(forAudit(before), forAudit(updated)),
      });
      return toPolicy(updated);
    });
  }
}

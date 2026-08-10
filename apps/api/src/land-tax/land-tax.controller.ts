import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type { Policy, ServiceApplication } from "@prisma/client";
import {
  assessLandTax,
  type Area,
  type LandTaxRates,
  type LandUse,
} from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { PayLandTaxDto } from "./pay-land-tax.dto";

/** The tax year being billed. One place, so holdings and payment agree. */
function assessmentYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

function ratesFrom(policy: Policy): LandTaxRates {
  return {
    perDecimalByLandUse: (policy.landTaxRatePerDecimalBdt ?? {}) as LandTaxRates["perDecimalByLandUse"],
    agriculturalExemptionDecimals: policy.landTaxAgriculturalExemptionDecimals,
    arrearSurchargePercent: policy.landTaxArrearSurchargePercent,
    maxArrearYears: policy.landTaxMaxArrearYears,
  };
}

/**
 * The last year settled for a parcel, read off the paid land-tax applications
 * themselves rather than a separate counter — the payment record *is* the
 * evidence, so there is no second source of truth to drift from it.
 */
function paidThroughYear(paid: ServiceApplication[], parcelId: string): number | null {
  const years = paid
    .filter((a) => a.parcelId === parcelId)
    .map((a) => Number((a.details as { assessmentYear?: number })?.assessmentYear))
    .filter((y) => Number.isFinite(y));
  return years.length > 0 ? Math.max(...years) : null;
}

/**
 * Land development tax (khajna) — the citizen's holdings and what each owes.
 *
 * Assessments are computed here, never accepted from the client: what a
 * citizen owes is the registry's determination, and a bill the browser can
 * name is a bill the browser can discount. The payment itself is recorded as
 * a ServiceApplication (serviceType "land-tax"), the shared model from the
 * previous step, so tracking and audit come for free.
 */
@Controller("land-tax")
export class LandTaxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every holding the signed-in citizen owns, each with its own assessment. */
  @Get("holdings")
  async holdings(@Req() req: Request) {
    const me = currentUserId(req);
    const [parcels, policy, paid] = await Promise.all([
      this.prisma.parcel.findMany({ where: { ownerId: me }, orderBy: { dagNo: "asc" } }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
      this.prisma.serviceApplication.findMany({
        where: { applicantId: me, serviceType: "land-tax", paidAt: { not: null } },
      }),
    ]);
    if (!policy) throw new NotFoundError("Policies not configured");

    const rates = ratesFrom(policy);
    const year = assessmentYear();

    return parcels.map((parcel) => ({
      parcelId: parcel.id,
      ulpin: parcel.ulpin,
      dagNo: parcel.dagNo,
      khatianNo: parcel.khatianNo,
      title: parcel.title,
      landUse: parcel.landUse,
      area: parcel.area,
      assessmentYear: year,
      paidThroughYear: paidThroughYear(paid, parcel.id),
      assessment: assessLandTax(
        {
          area: parcel.area as unknown as Area,
          landUse: parcel.landUse as LandUse,
          assessmentYear: year,
          paidThroughYear: paidThroughYear(paid, parcel.id),
          liableFromYear: parcel.registeredAt.getUTCFullYear(),
        },
        rates,
      ),
    }));
  }

  /**
   * Settle a holding's bill. Simulated — no gateway is called, the same
   * stand-in as everywhere else in this codebase.
   *
   * The amount is recomputed here from the registry and the policy; the
   * request body carries only *which* holding and *how* it was paid. Recording
   * a client-supplied total would let anyone pay one taka against any bill.
   */
  @Post("pay")
  @HttpCode(201)
  async pay(@Body() body: PayLandTaxDto, @Req() req: Request) {
    const me = currentUserId(req);
    const [parcel, policy, paid] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId } }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
      this.prisma.serviceApplication.findMany({
        where: { applicantId: me, serviceType: "land-tax", paidAt: { not: null } },
      }),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (!policy) throw new NotFoundError("Policies not configured");
    // Tax is the holder's liability — paying it is not an open action on
    // someone else's plot, and allowing it would let anyone write a payment
    // record against a stranger's holding.
    if (parcel.ownerId !== me) throw new NotFoundError("Parcel not found");

    const year = assessmentYear();
    const settled = paidThroughYear(paid, parcel.id);
    if (settled !== null && settled >= year) {
      throw new ConflictError("This holding is already paid for the current year.");
    }

    const assessment = assessLandTax(
      {
        area: parcel.area as unknown as Area,
        landUse: parcel.landUse as LandUse,
        assessmentYear: year,
        paidThroughYear: settled,
        liableFromYear: parcel.registeredAt.getUTCFullYear(),
      },
      ratesFrom(policy),
    );
    if (assessment.total <= 0) {
      throw new ConflictError("Nothing is due on this holding.");
    }

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.serviceApplication.count({ where: { serviceType: "land-tax" } });
      const applicationNo = `LDT-2026-${String(1000 + count).padStart(6, "0")}`;
      const now = new Date();

      const created = await tx.serviceApplication.create({
        data: {
          id: `sa-${randomUUID()}`,
          applicationNo,
          serviceType: "land-tax",
          // Paying khajna is a counter transaction, not an application anyone
          // adjudicates — it is settled the moment it is paid.
          status: "approved",
          parcelId: parcel.id,
          applicantId: me,
          details: {
            assessmentYear: year,
            decimals: assessment.decimals,
            arrears: assessment.arrears,
            currentYearDue: assessment.currentYearDue,
            years: assessment.years,
          } as never,
          documentIds: [],
          feeAmount: assessment.total,
          paymentMethod: body.paymentMethod,
          transactionId: `TXN-${randomUUID().slice(0, 8).toUpperCase()}`,
          paidAt: now,
          submittedAt: now,
          decidedAt: now,
        },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: created.id,
        action: "payment",
        actorId: me,
        payload: {
          applicationNo: created.applicationNo,
          serviceType: "land-tax",
          parcelDagNo: parcel.dagNo,
          assessmentYear: year,
          amount: created.feeAmount,
        },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: created.id,
          at: now,
          type: "payment-recorded",
          title: "Land development tax paid",
          actorId: me,
        },
      });

      return created;
    });
  }
}

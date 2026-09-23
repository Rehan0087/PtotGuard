import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
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
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { coveredJurisdictionIds, loadMutationActor } from "../mutations/mutation-access";
import { PayLandTaxDto } from "./pay-land-tax.dto";
import { NotifyLandTaxDto } from "./notify-land-tax.dto";

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

function paidAssessmentYear(payment: ServiceApplication): number {
  return Number((payment.details as { assessmentYear?: number })?.assessmentYear);
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

  /** Jurisdiction-wide assessment, collection, arrears and receipt register. */
  @Get("collection")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  async collection(@Req() req: Request) {
    const actor = await loadMutationActor(this.prisma, req);
    const jurisdictions = await this.prisma.jurisdiction.findMany();
    const covered = [...coveredJurisdictionIds(actor, jurisdictions)];
    const [parcels, policy, paid, activeRevenueCases] = await Promise.all([
      this.prisma.parcel.findMany({
        where: { jurisdictionId: { in: covered } },
        include: { owner: { select: { name: true } } },
        orderBy: { dagNo: "asc" },
      }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
      this.prisma.serviceApplication.findMany({
        where: {
          serviceType: "land-tax",
          paidAt: { not: null },
          parcel: { jurisdictionId: { in: covered } },
        },
        orderBy: { paidAt: "desc" },
      }),
      this.prisma.serviceApplication.findMany({
        where: {
          serviceType: "revenue-case",
          status: { notIn: ["approved", "rejected", "withdrawn"] },
          parcel: { jurisdictionId: { in: covered } },
        },
        select: { parcelId: true },
      }),
    ]);
    if (!policy) throw new NotFoundError("Policies not configured");

    const year = assessmentYear();
    const rates = ratesFrom(policy);
    const parcelById = new Map(parcels.map((parcel) => [parcel.id, parcel]));
    const parcelsWithActiveRevenueCases = new Set(activeRevenueCases.map((item) => item.parcelId));
    const payments = paid.flatMap((payment) => {
      const parcel = payment.parcelId ? parcelById.get(payment.parcelId) : undefined;
      if (!parcel || !payment.paidAt || !payment.feeAmount || !payment.paymentMethod || !payment.transactionId) return [];
      return [{
        id: payment.id,
        applicationNo: payment.applicationNo,
        parcelId: parcel.id,
        dagNo: parcel.dagNo,
        khatianNo: parcel.khatianNo,
        ownerId: parcel.ownerId,
        ownerName: parcel.owner.name,
        assessmentYear: paidAssessmentYear(payment),
        amount: payment.feeAmount,
        paymentMethod: payment.paymentMethod,
        transactionId: payment.transactionId,
        paidAt: payment.paidAt,
      }];
    });

    const holdings = parcels.map((parcel) => {
      const settled = paidThroughYear(paid, parcel.id);
      const assessment = assessLandTax({
        area: parcel.area as unknown as Area,
        landUse: parcel.landUse as LandUse,
        assessmentYear: year,
        paidThroughYear: settled,
        liableFromYear: parcel.registeredAt.getUTCFullYear(),
      }, rates);
      const latestPayment = payments.find((payment) => payment.parcelId === parcel.id) ?? null;
      const status = assessment.exemption ? "exempt" : settled !== null && settled >= year ? "paid" : "due";
      return {
        parcelId: parcel.id,
        ulpin: parcel.ulpin,
        dagNo: parcel.dagNo,
        khatianNo: parcel.khatianNo,
        title: parcel.title,
        landUse: parcel.landUse,
        area: parcel.area,
        ownerId: parcel.ownerId,
        ownerName: parcel.owner.name,
        assessmentYear: year,
        paidThroughYear: settled,
        assessment,
        status,
        latestPayment,
        hasActiveRevenueCase: parcelsWithActiveRevenueCases.has(parcel.id),
      };
    });
    const currentPayments = payments.filter((payment) => payment.assessmentYear === year);
    const collected = currentPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = holdings.reduce((sum, holding) => sum + holding.assessment.total, 0);

    return {
      assessmentYear: year,
      summary: {
        holdingCount: holdings.length,
        paidCount: holdings.filter((holding) => holding.status === "paid").length,
        dueCount: holdings.filter((holding) => holding.status === "due").length,
        exemptCount: holdings.filter((holding) => holding.status === "exempt").length,
        assessed: collected + outstanding,
        collected,
        outstanding,
      },
      holdings,
      payments,
    };
  }

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
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("citizen")
  @Post("pay")
  @HttpCode(201)
  async pay(@Body() body: PayLandTaxDto, @Req() req: Request) {
    const me = currentUserId(req);
    return this.settle(body, me, me);
  }

  /** Remind a landowner to pay. Officers never record payment on their behalf. */
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("land-office")
  @Post("notify")
  @HttpCode(201)
  async notify(@Body() body: NotifyLandTaxDto, @Req() req: Request) {
    const actor = await loadMutationActor(this.prisma, req);
    const [parcel, jurisdictions, policy, paid] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId }, include: { owner: true } }),
      this.prisma.jurisdiction.findMany(),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
      this.prisma.serviceApplication.findMany({
        where: { parcelId: body.parcelId, serviceType: "land-tax", paidAt: { not: null } },
      }),
    ]);
    if (!parcel || !coveredJurisdictionIds(actor, jurisdictions).has(parcel.jurisdictionId)) {
      throw new NotFoundError("Parcel not found");
    }
    if (!policy) throw new NotFoundError("Policies not configured");

    const year = assessmentYear();
    const settled = paidThroughYear(paid, parcel.id);
    const assessment = assessLandTax({
      area: parcel.area as unknown as Area,
      landUse: parcel.landUse as LandUse,
      assessmentYear: year,
      paidThroughYear: settled,
      liableFromYear: parcel.registeredAt.getUTCFullYear(),
    }, ratesFrom(policy));
    if (assessment.total <= 0 || (settled !== null && settled >= year)) {
      throw new ConflictError("This holding has no outstanding tax.");
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const notification = await tx.appNotification.create({
        data: {
          id: `ntf-${randomUUID()}`,
          userId: parcel.ownerId,
          at: now,
          severity: "warning",
          title: "Land tax payment due",
          body: `Land development tax of BDT ${assessment.total} is due for dag ${parcel.dagNo} for ${year}.`,
          content: { code: "land-tax-reminder", dagNo: parcel.dagNo, assessmentYear: year, amount: assessment.total },
          read: false,
          href: "/land-tax",
        },
      });
      await this.audit.append(tx, {
        entityType: "parcel",
        entityId: parcel.id,
        action: "tax-reminder-sent",
        actorId: actor.id,
        payload: { ownerId: parcel.ownerId, assessmentYear: year, amount: assessment.total },
      });
      return notification;
    });
  }

  private async settle(body: PayLandTaxDto, applicantId: string, actorId: string) {
    const [parcel, policy, paid] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId } }),
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
      this.prisma.serviceApplication.findMany({
        where: { applicantId, serviceType: "land-tax", paidAt: { not: null } },
      }),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    if (!policy) throw new NotFoundError("Policies not configured");
    // Tax is the holder's liability — paying it is not an open action on
    // someone else's plot, and allowing it would let anyone write a payment
    // record against a stranger's holding.
    if (parcel.ownerId !== applicantId) throw new NotFoundError("Parcel not found");

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
      const applicationNo = `LDT-${year}-${String(1000 + count).padStart(6, "0")}`;
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
          applicantId,
          assignedOfficerId: actorId === applicantId ? undefined : actorId,
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
        actorId,
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
          actorId,
        },
      });

      return created;
    });
  }
}

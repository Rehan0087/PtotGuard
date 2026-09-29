import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { calcInheritance, type InheritanceInput } from "@plotguard/rules";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { currentUserId } from "../auth/dev-current-user";
import { PrismaService } from "../prisma/prisma.service";
import { CalculateInheritanceDto } from "./calculate-inheritance.dto";

/**
 * Faraiz succession shares, the one endpoint the calculator
 * screen needs. The arithmetic itself is `calcInheritance()` in
 * @plotguard/rules, unit-tested there and shared with the mock — this only
 * validates the request and hands it over.
 *
 * Nothing is stored or decided, so there is no audit entry. The calculation
 * is nevertheless authenticated: parcel ownership, market value, and the
 * deceased owner's gender all come from database records rather than fields a
 * browser could rewrite.
 */
@Controller("inheritance")
export class InheritanceController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("calculate")
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async calculate(@Body() body: CalculateInheritanceDto, @Req() req: Request) {
    if (body.method !== "faraiz") {
      throw new BadRequestException("Only Faraiz inheritance calculations are supported");
    }
    const userId = currentUserId(req);
    const [user, parcels] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { profileDetails: true } }),
      this.prisma.parcel.findMany({
        where: { id: { in: body.parcelIds }, ownerId: userId },
        select: { id: true, marketValue: true },
      }),
    ]);
    if (parcels.length !== body.parcelIds.length) {
      throw new ForbiddenException("Every selected parcel must belong to the signed-in citizen");
    }

    const gender = String(
      user?.profileDetails && typeof user.profileDetails === "object" && !Array.isArray(user.profileDetails)
        ? (user.profileDetails as Record<string, unknown>).gender ?? ""
        : "",
    ).toLowerCase();
    if (gender === "female" && body.heirs.some((heir) => heir.relation === "wife")) {
      throw new BadRequestException("A female citizen can select a husband, not a wife");
    }
    if (gender === "male" && body.heirs.some((heir) => heir.relation === "husband")) {
      throw new BadRequestException("A male citizen can select a wife, not a husband");
    }

    const estateValue = parcels.reduce((sum, parcel) => {
      const value = parcel.marketValue as { amount?: unknown } | null;
      return sum + (typeof value?.amount === "number" ? value.amount : 0);
    }, 0);
    return calcInheritance({
      method: body.method,
      heirs: body.heirs,
      estateValue,
    } satisfies InheritanceInput);
  }
}

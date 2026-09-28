import type { Request } from "express";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AuthenticatedRequest } from "../auth/dev-current-user";
import type { PrismaService } from "../prisma/prisma.service";
import { InheritanceController } from "./inheritance.controller";

const parcels = [
  { id: "parcel-1", ownerId: "citizen-1", marketValue: { amount: 1_000_000, currency: "BDT" } },
  { id: "parcel-2", ownerId: "citizen-1", marketValue: { amount: 500_000, currency: "BDT" } },
  { id: "parcel-other", ownerId: "citizen-2", marketValue: { amount: 9_000_000, currency: "BDT" } },
];

function requestFor(userId: string): Request {
  return { user: { id: userId, role: "citizen" } } as unknown as AuthenticatedRequest;
}

function controllerFor(gender: "Male" | "Female") {
  const prisma = {
    user: {
      findUnique: async () => ({ profileDetails: { gender } }),
    },
    parcel: {
      findMany: async ({ where }: { where: { id: { in: string[] }; ownerId: string } }) =>
        parcels
          .filter((parcel) => where.id.in.includes(parcel.id) && parcel.ownerId === where.ownerId)
          .map(({ id, marketValue }) => ({ id, marketValue })),
    },
  } as unknown as PrismaService;
  return new InheritanceController(prisma);
}

describe("InheritanceController", () => {
  it("rejects Hindu succession calculations", async () => {
    await expect(
      controllerFor("Male").calculate(
        {
          method: "hindu",
          parcelIds: ["parcel-1"],
          heirs: [{ relation: "son", count: 1 }],
        },
        requestFor("citizen-1"),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("derives the estate amount from every selected parcel owned by the citizen", async () => {
    const result = await controllerFor("Male").calculate(
      {
        method: "faraiz",
        parcelIds: ["parcel-1", "parcel-2"],
        heirs: [
          { relation: "wife", count: 1 },
          { relation: "son", count: 1 },
        ],
      },
      requestFor("citizen-1"),
    );

    expect(result.shares.find((share) => share.relation === "wife")?.amount).toBe(187_500);
    expect(result.shares.find((share) => share.relation === "son")?.amount).toBe(1_312_500);
  });

  it("rejects a parcel that is not owned by the signed-in citizen", async () => {
    await expect(
      controllerFor("Male").calculate(
        {
          method: "faraiz",
          parcelIds: ["parcel-1", "parcel-other"],
          heirs: [{ relation: "son", count: 1 }],
        },
        requestFor("citizen-1"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("uses the stored male profile to allow wife but reject husband", async () => {
    await expect(
      controllerFor("Male").calculate(
        {
          method: "faraiz",
          parcelIds: ["parcel-1"],
          heirs: [{ relation: "husband", count: 1 }],
        },
        requestFor("citizen-1"),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses the stored female profile to allow husband but reject wife", async () => {
    await expect(
      controllerFor("Female").calculate(
        {
          method: "faraiz",
          parcelIds: ["parcel-1"],
          heirs: [{ relation: "wife", count: 1 }],
        },
        requestFor("citizen-1"),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

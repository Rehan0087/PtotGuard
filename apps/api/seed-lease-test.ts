import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // Find a citizen user to attach the leases to
  const citizen = await prisma.user.findFirst({
    where: { role: "citizen" },
  });

  if (!citizen) {
    console.error("No citizen user found. Run standard seed first.");
    process.exit(1);
  }

  console.log(`Seeding leases for user ${citizen.name} (${citizen.id})`);

  const now = new Date();
  
  // 1. A newly applied lease (submitted)
  await prisma.serviceApplication.create({
    data: {
      id: `sa-${randomUUID()}`,
      applicationNo: `LSE-2026-TEST01`,
      serviceType: "lease-settlement",
      status: "submitted",
      applicantId: citizen.id,
      feeAmount: 20,
      submittedAt: now,
      details: {
        landUse: "agricultural",
        locationDescription: "Test Agricultural Plot 1",
        areaDecimals: 5,
        termYears: 1,
        purpose: "Farming",
        leaseFeeAmount: 300,
      } as any,
    }
  });
  console.log("Created submitted lease application");

  // 2. An approved lease awaiting payment
  await prisma.serviceApplication.create({
    data: {
      id: `sa-${randomUUID()}`,
      applicationNo: `LSE-2026-TEST02`,
      serviceType: "lease-settlement",
      status: "approved",
      applicantId: citizen.id,
      feeAmount: 20,
      submittedAt: new Date(now.getTime() - 86400000), // 1 day ago
      decidedAt: now,
      details: {
        landUse: "non-agricultural",
        locationDescription: "Test Non-Agri Plot 2",
        areaDecimals: 10,
        termYears: 1,
        purpose: "Commercial",
        leaseFeeAmount: 1000,
      } as any,
    }
  });
  console.log("Created approved lease application (awaiting fee)");

  // 3. An active lease with a remaining duration flag
  const activeExpiresAt = new Date(now);
  activeExpiresAt.setFullYear(activeExpiresAt.getFullYear() + 1);
  
  await prisma.serviceApplication.create({
    data: {
      id: `sa-${randomUUID()}`,
      applicationNo: `LSE-2026-TEST03`,
      serviceType: "lease-settlement",
      status: "approved",
      applicantId: citizen.id,
      feeAmount: 20,
      submittedAt: new Date(now.getTime() - 86400000 * 2),
      decidedAt: new Date(now.getTime() - 86400000),
      details: {
        landUse: "agricultural",
        locationDescription: "Test Active Plot 3",
        areaDecimals: 15,
        termYears: 1,
        purpose: "Farming",
        leaseFeeAmount: 300,
        leaseFeePaidAt: now.toISOString(),
        leaseExpiresAt: activeExpiresAt.toISOString(),
      } as any,
    }
  });
  console.log("Created active lease application (paid)");

  console.log("Done seeding dummy lease data.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

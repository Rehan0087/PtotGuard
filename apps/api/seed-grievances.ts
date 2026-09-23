import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as crypto from "crypto";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log("Seeding grievances...");
  const grvId = `grv-${crypto.randomUUID()}`;
  await prisma.grievance.create({
    data: {
      id: grvId,
      caseNumber: "GRV-2026-01001",
      category: "delay",
      status: "under-review",
      description: "My land acquisition payment has been delayed for 6 months despite all documents being submitted.",
      filedById: "usr-karim",
      filedByName: "Karim Mia",
      assignedOfficerId: "usr-officer",
      slaDeadline: new Date("2026-08-01T10:00:00Z"),
      createdAt: new Date("2026-07-20T10:00:00Z"),
      updatedAt: new Date("2026-07-22T10:00:00Z"),
    },
  });

  await prisma.grievanceEvent.createMany({
    data: [
      {
        id: `ge-${crypto.randomUUID()}`,
        grievanceId: grvId,
        at: new Date("2026-07-20T10:00:00Z"),
        type: "filed",
        title: "Grievance filed",
        actorId: "usr-karim",
      },
      {
        id: `ge-${crypto.randomUUID()}`,
        grievanceId: grvId,
        at: new Date("2026-07-22T10:00:00Z"),
        type: "status-change",
        title: "Status updated",
        description: "Status changed to under-review",
        actorId: "usr-officer",
      },
    ],
  });

  console.log("Done seeding dummy grievance data.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

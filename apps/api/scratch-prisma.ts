import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findUnique({ where: { id: "usr-ayesha" } });
  console.log("Before:", user?.profileDetails);

  const updated = await prisma.user.update({
    where: { id: "usr-ayesha" },
    data: {
      profileDetails: { nameBn: "Test Bengali Name" }
    }
  });

  console.log("After:", updated.profileDetails);
}

run().catch(console.error).finally(() => prisma.$disconnect());

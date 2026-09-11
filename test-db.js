const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.appNotification.count();
  console.log("Count:", count);
}
main().catch(console.error).finally(() => prisma.$disconnect());

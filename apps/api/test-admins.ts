import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const admins = await prisma.user.findMany({ where: { role: 'admin' } });
  const officers = await prisma.user.findMany({ where: { role: 'land-office' } });
  console.log('Admins:', admins.length, admins[0]?.id);
  console.log('Officers:', officers.length, officers[0]?.id);
}
main().catch(console.error).finally(() => prisma.$disconnect());

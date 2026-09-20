import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:55432/plotguard?schema=public' });
const prisma = new PrismaClient({ adapter });

async function main() {
  const docs = await prisma.landDocument.findMany();
  for (const doc of docs) {
    const pId = doc.parcelId || 'general';
    await prisma.landDocument.update({
      where: { id: doc.id },
      data: { thumbnailUrl: `/documents/${pId}/${doc.fileName}` }
    });
  }
  console.log("Updated all thumbnail URLs");
}
main().catch(console.error).finally(() => prisma.$disconnect());

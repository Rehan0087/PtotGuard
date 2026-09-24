import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: 'postgresql://postgres:plotguard@localhost:55432/plotguard?schema=public' } as any);
const prisma = new PrismaClient({ adapter });

async function run() {
  const sa = await prisma.serviceApplication.findUnique({ where: { id: 'sa-29f2ebda-5761-4a1a-b4c1-55b343f4c68f' } });
  console.log('SA:', sa);
  const plot = await prisma.khasLandPlot.findUnique({ where: { id: sa.khasPlotId } });
  console.log('Plot:', plot);
}
run();

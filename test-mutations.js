const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const mutations = await prisma.mutation.findMany({
    where: {
      status: {
        in: ['field-investigation', 'field-verification-complete', 'completed']
      }
    },
    include: {
      fieldReports: true
    }
  });
  
  console.log(JSON.stringify(mutations, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());

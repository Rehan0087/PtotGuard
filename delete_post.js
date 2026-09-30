const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const posts = await prisma.communityPost.findMany({
    where: {
      authorName: 'Ayesha Siddika'
    },
    include: {
      comments: true
    }
  });
  console.log(JSON.stringify(posts, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());

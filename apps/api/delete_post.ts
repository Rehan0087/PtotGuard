import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const posts = await prisma.communityPost.findMany({
    where: {
      OR: [
        { title: { contains: 'Khamba' } },
        { body: { contains: 'Khamba' } }
      ]
    },
    include: {
      comments: true
    }
  });
  
  for (const post of posts) {
    console.log(`Deleting post: ${post.id}`);
    await prisma.communityComment.deleteMany({
      where: { postId: post.id }
    });
    await prisma.communityPost.delete({
      where: { id: post.id }
    });
    console.log(`Deleted successfully.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const filer = await prisma.user.findFirst({ where: { role: 'citizen' } });
  const admins = await prisma.user.findMany({ where: { role: 'admin' } });
  
  if (!filer) throw new Error("No citizen found");
  
  console.log("Filer:", filer.id);
  console.log("Admin:", admins[0]?.id);

  const assignedOfficerId = undefined;
  const escalatedToId = admins[0]?.id;
  const now = new Date();
  
  const created = await prisma.grievance.create({
    data: {
      id: `grv-${randomUUID()}`,
      caseNumber: `GRV-TEST-${Date.now()}`,
      category: 'staff-conduct',
      status: 'submitted',
      description: 'lazy worker on your office',
      filedById: filer.id,
      filedByName: filer.name,
      assignedOfficerId,
      escalatedToId,
      slaDeadline: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    }
  });
  console.log("Created:", created);
}

main().catch(console.error).finally(() => prisma.$disconnect());

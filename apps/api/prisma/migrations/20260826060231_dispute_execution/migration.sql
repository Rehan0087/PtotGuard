-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "recordsExecutedAt" TIMESTAMP(3),
ADD COLUMN     "recordsExecutedById" TEXT;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_recordsExecutedById_fkey" FOREIGN KEY ("recordsExecutedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "mutations" ADD COLUMN     "toOwnerId" TEXT;

-- AddForeignKey
ALTER TABLE "mutations" ADD CONSTRAINT "mutations_toOwnerId_fkey" FOREIGN KEY ("toOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

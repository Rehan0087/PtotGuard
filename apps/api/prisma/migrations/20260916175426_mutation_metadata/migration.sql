-- AlterTable
ALTER TABLE "mutations" ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "updatedAt" DROP DEFAULT;

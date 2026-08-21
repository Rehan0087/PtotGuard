-- AlterTable
ALTER TABLE "policies" ADD COLUMN     "landAdminCertifiedCopyFeeBdt" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "landAdminCorrectionFeeBdt" INTEGER NOT NULL DEFAULT 500;

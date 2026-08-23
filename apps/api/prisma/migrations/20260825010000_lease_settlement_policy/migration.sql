-- AlterTable
ALTER TABLE "policies" ADD COLUMN     "leaseSettlementAgriculturalFeeBdt" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "leaseSettlementNonAgriculturalFeeBdt" INTEGER NOT NULL DEFAULT 1000;

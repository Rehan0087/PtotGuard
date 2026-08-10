-- Land development tax settings, on the Policy singleton rather than in the
-- rule that applies them: statutory rates change by finance act and are not
-- uniform across the country. See assessLandTax() in @plotguard/rules.
ALTER TABLE "policies" ADD COLUMN     "landTaxAgriculturalExemptionDecimals" INTEGER NOT NULL DEFAULT 825,
ADD COLUMN     "landTaxArrearSurchargePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "landTaxRatePerDecimalBdt" JSONB NOT NULL DEFAULT '{}';

-- Seed the singleton with a working schedule so the service is usable on a
-- fresh database. These are demonstration figures, not a published rate
-- schedule — an operator sets the real ones for their district.
UPDATE "policies" SET
  "landTaxRatePerDecimalBdt" = '{"agricultural":2,"residential":10,"commercial":25,"industrial":30,"mixed":15,"vacant":5}',
  "landTaxAgriculturalExemptionDecimals" = 825,
  "landTaxArrearSurchargePercent" = 10
WHERE "id" = 'singleton';

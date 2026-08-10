-- How many years back arrears are billed. Without a bound, a plot on the
-- register since 1990 presents a thirty-seven-line bill carrying several times
-- its own assessment in accumulated surcharge — arithmetically consistent and
-- useless to the person paying it. Recovery windows are bounded in practice.
ALTER TABLE "policies" ADD COLUMN "landTaxMaxArrearYears" INTEGER NOT NULL DEFAULT 3;

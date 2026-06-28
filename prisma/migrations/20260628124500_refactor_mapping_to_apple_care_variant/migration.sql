ALTER TABLE "AppleCareProductMapping"
    ADD COLUMN "appleCareProductId" TEXT,
    ADD COLUMN "appleCareProductTitle" TEXT,
    ADD COLUMN "appleCareVariantId" TEXT,
    ADD COLUMN "appleCareVariantTitle" TEXT,
    ADD COLUMN "appleCareSku" TEXT,
    ADD COLUMN "appleCarePriceSnapshot" DECIMAL(12, 4);

UPDATE "AppleCareProductMapping"
SET
    "appleCareProductTitle" = "appleCarePartNumber",
    "appleCareVariantTitle" = "appleCarePartNumber"
WHERE "appleCarePartNumber" IS NOT NULL;

ALTER TABLE "AppleCareProductMapping"
    DROP CONSTRAINT IF EXISTS "AppleCareProductMapping_appleCarePricingId_fkey";

DROP INDEX IF EXISTS "AppleCareProductMapping_appleCarePricingId_idx";

CREATE INDEX "AppleCareProductMapping_appleCareVariantId_idx"
    ON "AppleCareProductMapping"("appleCareVariantId");

ALTER TABLE "AppleCareProductMapping"
    DROP COLUMN IF EXISTS "appleCarePricingId",
    DROP COLUMN IF EXISTS "appleCarePartNumber";

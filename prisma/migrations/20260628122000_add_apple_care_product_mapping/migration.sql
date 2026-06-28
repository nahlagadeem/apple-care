CREATE TABLE "AppleCareProductMapping" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyProductTitle" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "shopifyVariantTitle" TEXT,
    "shopifySku" TEXT,
    "appleCarePricingId" INTEGER NOT NULL,
    "appleCarePartNumber" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleCareProductMapping_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppleCareProductMapping_shop_shopifyVariantId_idx"
    ON "AppleCareProductMapping"("shop", "shopifyVariantId");

CREATE INDEX "AppleCareProductMapping_appleCarePricingId_idx"
    ON "AppleCareProductMapping"("appleCarePricingId");

CREATE UNIQUE INDEX "AppleCareProductMapping_one_active_variant_idx"
    ON "AppleCareProductMapping"("shop", "shopifyVariantId")
    WHERE "isActive" = true;

ALTER TABLE "AppleCareProductMapping"
    ADD CONSTRAINT "AppleCareProductMapping_appleCarePricingId_fkey"
    FOREIGN KEY ("appleCarePricingId")
    REFERENCES "AppleCarePricing"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

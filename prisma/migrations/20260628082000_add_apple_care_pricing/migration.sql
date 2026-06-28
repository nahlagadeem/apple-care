-- CreateTable
CREATE TABLE "AppleCarePricing" (
    "id" SERIAL NOT NULL,
    "partNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sell" DECIMAL(12,4) NOT NULL,
    "sellWithVat" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleCarePricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppleCarePricing_partNumber_key" ON "AppleCarePricing"("partNumber");

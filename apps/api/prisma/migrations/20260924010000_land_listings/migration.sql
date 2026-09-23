-- CreateTable
CREATE TABLE "land_listings" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "askingPriceBdt" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "land_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "land_listing_inquiries" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "land_listing_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "land_listings_parcelId_idx" ON "land_listings"("parcelId");

-- CreateIndex
CREATE INDEX "land_listings_sellerId_idx" ON "land_listings"("sellerId");

-- CreateIndex
CREATE INDEX "land_listings_status_idx" ON "land_listings"("status");

-- CreateIndex
CREATE INDEX "land_listing_inquiries_listingId_idx" ON "land_listing_inquiries"("listingId");

-- CreateIndex
CREATE INDEX "land_listing_inquiries_buyerId_idx" ON "land_listing_inquiries"("buyerId");

-- AddForeignKey
ALTER TABLE "land_listings" ADD CONSTRAINT "land_listings_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listings" ADD CONSTRAINT "land_listings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_inquiries" ADD CONSTRAINT "land_listing_inquiries_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "land_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_inquiries" ADD CONSTRAINT "land_listing_inquiries_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


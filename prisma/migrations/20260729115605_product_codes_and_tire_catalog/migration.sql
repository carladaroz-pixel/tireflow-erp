-- CreateEnum
CREATE TYPE "ProductCodeType" AS ENUM ('BARCODE', 'INTERNAL', 'SUPPLIER', 'ALTERNATIVE');

-- CreateTable
CREATE TABLE "product_codes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "ProductCodeType" NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "normalized_value" VARCHAR(100) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_catalog_items" (
    "id" UUID NOT NULL,
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "width" INTEGER NOT NULL,
    "profile" INTEGER NOT NULL,
    "rim" INTEGER NOT NULL,
    "normalized_measure" VARCHAR(30) NOT NULL,
    "measure" VARCHAR(30) NOT NULL,
    "vehicle_type" VARCHAR(50) NOT NULL,
    "description" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_codes_organization_id_product_id_type_idx" ON "product_codes"("organization_id", "product_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "product_codes_organization_id_normalized_value_key" ON "product_codes"("organization_id", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "tire_catalog_items_normalized_measure_key" ON "tire_catalog_items"("normalized_measure");

-- CreateIndex
CREATE INDEX "tire_catalog_items_active_width_profile_rim_idx" ON "tire_catalog_items"("active", "width", "profile", "rim");

-- AddForeignKey
ALTER TABLE "product_codes" ADD CONSTRAINT "product_codes_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

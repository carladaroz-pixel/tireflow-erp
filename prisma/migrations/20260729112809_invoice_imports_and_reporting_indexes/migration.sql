-- CreateEnum
CREATE TYPE "InvoiceImportStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'REVIEW_REQUIRED', 'READY', 'APPROVED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceItemReviewStatus" AS ENUM ('PENDING', 'MATCHED', 'IGNORED');

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "invoice_import_id" UUID;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tax_id" VARCHAR(20),
    "legal_name" VARCHAR(200) NOT NULL,
    "trade_name" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_imports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "supplier_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "status" "InvoiceImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "original_file_name" VARCHAR(240) NOT NULL,
    "file_type" VARCHAR(80) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "invoice_number" VARCHAR(80),
    "series" VARCHAR(30),
    "access_key" VARCHAR(60),
    "issued_at" TIMESTAMPTZ(3),
    "total_amount" DECIMAL(14,2),
    "extracted_data" JSONB,
    "warnings" JSONB,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_import_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_import_id" UUID NOT NULL,
    "matched_product_id" UUID,
    "sequence" INTEGER NOT NULL,
    "supplier_code" VARCHAR(80),
    "barcode" VARCHAR(80),
    "description" VARCHAR(300) NOT NULL,
    "ncm" VARCHAR(20),
    "cfop" VARCHAR(10),
    "unit" VARCHAR(20),
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "total_price" DECIMAL(14,2) NOT NULL,
    "brand" VARCHAR(100),
    "tire_size" VARCHAR(50),
    "dot" VARCHAR(30),
    "confidence" DECIMAL(5,4),
    "review_status" "InvoiceItemReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_import_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_organization_id_legal_name_idx" ON "suppliers"("organization_id", "legal_name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organization_id_tax_id_key" ON "suppliers"("organization_id", "tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organization_id_id_key" ON "suppliers"("organization_id", "id");

-- CreateIndex
CREATE INDEX "invoice_imports_organization_id_store_id_status_created_at_idx" ON "invoice_imports"("organization_id", "store_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "invoice_imports_organization_id_store_id_invoice_number_ser_idx" ON "invoice_imports"("organization_id", "store_id", "invoice_number", "series");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_imports_organization_id_store_id_access_key_key" ON "invoice_imports"("organization_id", "store_id", "access_key");

-- CreateIndex
CREATE INDEX "invoice_import_items_organization_id_invoice_import_id_idx" ON "invoice_import_items"("organization_id", "invoice_import_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_import_items_invoice_import_id_sequence_key" ON "invoice_import_items"("invoice_import_id", "sequence");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_invoice_import_id_fkey" FOREIGN KEY ("invoice_import_id") REFERENCES "invoice_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_organization_id_store_id_fkey" FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_organization_id_supplier_id_fkey" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "suppliers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_import_items" ADD CONSTRAINT "invoice_import_items_invoice_import_id_fkey" FOREIGN KEY ("invoice_import_id") REFERENCES "invoice_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_import_items" ADD CONSTRAINT "invoice_import_items_organization_id_matched_product_id_fkey" FOREIGN KEY ("organization_id", "matched_product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

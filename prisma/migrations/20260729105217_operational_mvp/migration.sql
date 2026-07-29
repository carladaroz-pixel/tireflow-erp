-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('TIRE', 'PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRY', 'EXIT');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'FINISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "ProductType" NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "size" VARCHAR(50),
    "rim" INTEGER,
    "internal_code" VARCHAR(60) NOT NULL,
    "barcode" VARCHAR(80),
    "purchase_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sale_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "minimum_stock" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "service_order_id" UUID,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previous_balance" INTEGER NOT NULL,
    "resulting_balance" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "reason" VARCHAR(80),
    "supplier" VARCHAR(160),
    "document" VARCHAR(80),
    "notes" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "tax_id" VARCHAR(20),
    "phone" VARCHAR(30) NOT NULL,
    "whatsapp" VARCHAR(30) NOT NULL,
    "email" VARCHAR(320),
    "license_plate" VARCHAR(12) NOT NULL,
    "vehicle_model" VARCHAR(120) NOT NULL,
    "notes" VARCHAR(500),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "responsible_user_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "vehicle_model" VARCHAR(120) NOT NULL,
    "license_plate" VARCHAR(12) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "notes" VARCHAR(500),
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'OPEN',
    "labor_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "products_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "inventory_posted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_organization_id_active_type_idx" ON "products"("organization_id", "active", "type");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_internal_code_key" ON "products"("organization_id", "internal_code");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_id_key" ON "products"("organization_id", "id");

-- CreateIndex
CREATE INDEX "stock_balances_organization_id_store_id_quantity_idx" ON "stock_balances"("organization_id", "store_id", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_organization_id_store_id_product_id_key" ON "stock_balances"("organization_id", "store_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_store_id_occurred_at_idx" ON "stock_movements"("organization_id", "store_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_store_id_product_id_idx" ON "stock_movements"("organization_id", "store_id", "product_id");

-- CreateIndex
CREATE INDEX "customers_organization_id_name_idx" ON "customers"("organization_id", "name");

-- CreateIndex
CREATE INDEX "customers_organization_id_license_plate_idx" ON "customers"("organization_id", "license_plate");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_id_key" ON "customers"("organization_id", "id");

-- CreateIndex
CREATE INDEX "service_orders_organization_id_store_id_status_idx" ON "service_orders"("organization_id", "store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_organization_id_store_id_number_key" ON "service_orders"("organization_id", "store_id", "number");

-- CreateIndex
CREATE INDEX "service_order_items_organization_id_service_order_id_idx" ON "service_order_items"("organization_id", "service_order_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_organization_id_store_id_fkey" FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_store_id_fkey" FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_organization_id_store_id_fkey" FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

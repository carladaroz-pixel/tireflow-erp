-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "organization_membership_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "store_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "store_access_status" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "active_organization_id" UUID,
ADD COLUMN     "active_organization_membership_id" UUID,
ADD COLUMN     "active_store_id" UUID,
ADD COLUMN     "context_updated_at" TIMESTAMPTZ(3),
ADD COLUMN     "context_version" INTEGER NOT NULL DEFAULT 0;

-- Manual invariant not represented by Prisma Schema Language.
-- Future migrations must preserve this constraint.
ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_active_context_shape_check"
CHECK (
    (
        "active_organization_id" IS NULL
        AND "active_organization_membership_id" IS NULL
        AND "active_store_id" IS NULL
    )
    OR
    (
        "active_organization_id" IS NOT NULL
        AND "active_organization_membership_id" IS NOT NULL
    )
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "trade_name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "status" "organization_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "organization_membership_status" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),
    "disabled_reason" VARCHAR(240),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "status" "store_status" NOT NULL DEFAULT 'ACTIVE',
    "is_headquarters" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_accesses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "organization_membership_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "status" "store_access_status" NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "organization_memberships_user_status_idx" ON "organization_memberships"("user_id", "status", "organization_id");

-- CreateIndex
CREATE INDEX "organization_memberships_organization_status_idx" ON "organization_memberships"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_user_key" ON "organization_memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_key" ON "organization_memberships"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_context_key" ON "organization_memberships"("organization_id", "id", "user_id");

-- CreateIndex
CREATE INDEX "stores_organization_status_idx" ON "stores"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stores_organization_code_key" ON "stores"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stores_organization_id_key" ON "stores"("organization_id", "id");

-- CreateIndex
CREATE INDEX "store_accesses_membership_status_idx" ON "store_accesses"("organization_membership_id", "status", "store_id");

-- CreateIndex
CREATE INDEX "store_accesses_store_status_idx" ON "store_accesses"("store_id", "status", "organization_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_accesses_membership_store_key" ON "store_accesses"("organization_membership_id", "store_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_accesses_context_key" ON "store_accesses"("organization_id", "organization_membership_id", "store_id");

-- CreateIndex
CREATE INDEX "sessions_active_organization_user_idx" ON "sessions"("active_organization_id", "user_id");

-- CreateIndex
CREATE INDEX "sessions_active_membership_idx" ON "sessions"("active_organization_membership_id");

-- CreateIndex
CREATE INDEX "sessions_active_store_idx" ON "sessions"("active_store_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_membership_fkey" FOREIGN KEY ("active_organization_id", "active_organization_membership_id", "user_id") REFERENCES "organization_memberships"("organization_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_store_fkey" FOREIGN KEY ("active_organization_id", "active_store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_store_access_fkey" FOREIGN KEY ("active_organization_id", "active_organization_membership_id", "active_store_id") REFERENCES "store_accesses"("organization_id", "organization_membership_id", "store_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_accesses" ADD CONSTRAINT "store_accesses_organization_membership_fkey" FOREIGN KEY ("organization_id", "organization_membership_id") REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_accesses" ADD CONSTRAINT "store_accesses_organization_store_fkey" FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

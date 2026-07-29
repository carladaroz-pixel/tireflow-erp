-- CreateEnum
CREATE TYPE "organization_role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER');

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "role" "organization_role" NOT NULL DEFAULT 'VIEWER';

-- CreateIndex
CREATE INDEX "organization_memberships_organization_status_role_idx" ON "organization_memberships"("organization_id", "status", "role");

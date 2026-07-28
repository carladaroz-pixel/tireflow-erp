-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "session_revocation_reason" AS ENUM ('USER_LOGOUT', 'REVOKE_ALL', 'CREDENTIAL_CHANGED', 'USER_DISABLED', 'ADMINISTRATIVE', 'SECURITY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" "session_revocation_reason",
    "ip_hash" CHAR(64),
    "user_agent" VARCHAR(512),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_credentials_user_id_key" ON "user_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_active_idx" ON "sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_idle_expires_at_idx" ON "sessions"("idle_expires_at");

-- CreateIndex
CREATE INDEX "sessions_revoked_at_idx" ON "sessions"("revoked_at");

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

import { z } from "zod";

import {
  Prisma,
  SessionRevocationReason,
  UserStatus,
} from "../../generated/prisma/client";
import { prisma } from "../db/prisma";
import {
  generateSessionToken,
  hashIpAddress,
  hashSessionToken,
} from "./session-token";

const uuidSchema = z.string().uuid();
const userAgentSchema = z.string().trim().min(1).max(512);
const sessionTokenSchema = z.string().min(43).max(128);

const sessionPublicSelect = {
  id: true,
  userId: true,
  createdAt: true,
  lastSeenAt: true,
  expiresAt: true,
  idleExpiresAt: true,
  revokedAt: true,
  revokedReason: true,
  userAgent: true,
  user: {
    select: {
      id: true,
      email: true,
      normalizedEmail: true,
      name: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.SessionSelect;

export type PublicSession = Prisma.SessionGetPayload<{
  select: typeof sessionPublicSelect;
}>;

type CreateSessionOptions = {
  absoluteTtlMs?: number;
  idleTtlMs?: number;
  ipAddress?: string;
  now?: Date;
  userAgent?: string;
};

export async function createSession(
  userId: string,
  options: CreateSessionOptions = {},
): Promise<{ session: PublicSession; token: string }> {
  const validUserId = uuidSchema.parse(userId);
  const now = options.now ?? new Date();
  const absoluteTtlMs = options.absoluteTtlMs ?? 30 * 24 * 60 * 60 * 1_000;
  const idleTtlMs = options.idleTtlMs ?? 7 * 24 * 60 * 60 * 1_000;

  z.number().int().positive().max(90 * 24 * 60 * 60 * 1_000).parse(absoluteTtlMs);
  z.number().int().positive().max(30 * 24 * 60 * 60 * 1_000).parse(idleTtlMs);

  const user = await prisma.user.findUnique({
    where: { id: validUserId },
    select: { status: true },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new Error("Authentication failed.");
  }

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);

  const session = await prisma.session.create({
    data: {
      userId: validUserId,
      tokenHash,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + absoluteTtlMs),
      idleExpiresAt: new Date(now.getTime() + idleTtlMs),
      ipHash: options.ipAddress ? hashIpAddress(options.ipAddress) : null,
      userAgent: options.userAgent
        ? userAgentSchema.parse(options.userAgent)
        : null,
    },
    select: sessionPublicSelect,
  });

  return { session, token };
}

export async function validateSession(
  token: string,
  now = new Date(),
): Promise<PublicSession | null> {
  const tokenHash = hashSessionToken(sessionTokenSchema.parse(token));
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: sessionPublicSelect,
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.idleExpiresAt <= now ||
    session.user.status !== UserStatus.ACTIVE
  ) {
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= 5 * 60 * 1_000) {
    return prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
      select: sessionPublicSelect,
    });
  }

  return session;
}

export async function revokeSession(
  sessionId: string,
  reason = SessionRevocationReason.USER_LOGOUT,
  now = new Date(),
): Promise<void> {
  await prisma.session.updateMany({
    where: {
      id: uuidSchema.parse(sessionId),
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      revokedReason: reason,
    },
  });
}

export async function revokeAllUserSessions(
  userId: string,
  reason = SessionRevocationReason.REVOKE_ALL,
  now = new Date(),
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId: uuidSchema.parse(userId),
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      revokedReason: reason,
    },
  });

  return result.count;
}

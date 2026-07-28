import { UserStatus } from "../../generated/prisma/client";
import { prisma } from "../db/prisma";
import { normalizeEmail } from "./email";
import { verifyPasswordOrDummy } from "./password";

export type AuthenticatedUser = {
  email: string;
  emailVerifiedAt: Date | null;
  id: string;
  name: string;
  normalizedEmail: string;
  status: UserStatus;
};

export async function authenticateWithPassword(
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { normalizedEmail },
    select: {
      id: true,
      email: true,
      normalizedEmail: true,
      name: true,
      status: true,
      emailVerifiedAt: true,
      credential: {
        select: {
          passwordHash: true,
        },
      },
    },
  });

  const passwordMatches = await verifyPasswordOrDummy(
    password,
    user?.credential?.passwordHash ?? null,
  );

  if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    normalizedEmail: user.normalizedEmail,
    name: user.name,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

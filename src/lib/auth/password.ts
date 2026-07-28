import { argon2id, hash, verify } from "argon2";
import { z } from "zod";

const passwordSchema = z.string().min(8).max(128);
const storedHashSchema = z.string().min(20).max(255);
const DUMMY_PASSWORD = "TireFlow dummy credential 2026 - never a real password";

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

let dummyHashPromise: Promise<string> | undefined;

export function validatePasswordInput(password: string): string {
  return passwordSchema.parse(password);
}

export async function hashPassword(password: string): Promise<string> {
  return hash(validatePasswordInput(password), ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  passwordSchema.parse(password);
  storedHashSchema.parse(passwordHash);

  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

async function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash(DUMMY_PASSWORD, ARGON2_OPTIONS);
  return dummyHashPromise;
}

export async function verifyPasswordOrDummy(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  const candidateHash = passwordHash ?? (await getDummyHash());
  const matches = await verifyPassword(password, candidateHash);
  return passwordHash !== null && matches;
}

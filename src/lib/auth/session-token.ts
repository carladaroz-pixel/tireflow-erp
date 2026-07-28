import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const tokenSchema = z.string().min(43).max(128);
const secretSchema = z.string().min(32).max(512);

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(
  token: string,
  secret = process.env.AUTH_SECRET,
): string {
  const validToken = tokenSchema.parse(token);
  const validSecret = secretSchema.parse(secret);
  return createHmac("sha256", validSecret).update(validToken).digest("hex");
}

export function sessionTokenHashesEqual(left: string, right: string): boolean {
  if (left.length !== 64 || right.length !== 64) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function hashIpAddress(
  ipAddress: string,
  secret = process.env.AUTH_SECRET,
): string {
  const validIp = z.string().trim().min(3).max(64).parse(ipAddress);
  const validSecret = secretSchema.parse(secret);
  return createHmac("sha256", validSecret).update(validIp).digest("hex");
}

import { z } from "zod";

const emailSchema = z.string().trim().min(3).max(320).email();

export function normalizeEmail(email: string): string {
  return emailSchema.parse(email).normalize("NFKC").toLocaleLowerCase("en-US");
}

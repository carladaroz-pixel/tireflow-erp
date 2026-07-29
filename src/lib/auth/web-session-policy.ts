export const SESSION_COOKIE_NAME = "tireflow_session";

export const SESSION_COOKIE_BASE = Object.freeze({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

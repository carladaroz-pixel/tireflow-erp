import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { AuthorizationContext } from "./authorization";
import {
  AuthorizationDeniedError,
  getAuthorizationContext,
} from "./authorization";
import { validateSession } from "./session";
export { SESSION_COOKIE_BASE, SESSION_COOKIE_NAME } from "./web-session-policy";
import { SESSION_COOKIE_NAME } from "./web-session-policy";

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function requireAuthenticatedToken(): Promise<string> {
  const token = await readSessionToken();
  if (!token || !(await validateSession(token))) {
    redirect("/entrar");
  }
  return token;
}

const resolveRequiredWorkspaceContext = async (): Promise<AuthorizationContext & {
  store: NonNullable<AuthorizationContext["store"]>;
  storeAccess: NonNullable<AuthorizationContext["storeAccess"]>;
}> => {
  const token = await requireAuthenticatedToken();
  try {
    const context = await getAuthorizationContext(token);
    if (!context.store || !context.storeAccess) {
      redirect("/contexto");
    }
    return context as AuthorizationContext & {
      store: NonNullable<AuthorizationContext["store"]>;
      storeAccess: NonNullable<AuthorizationContext["storeAccess"]>;
    };
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      redirect("/contexto");
    }
    throw error;
  }
};

export const getRequiredWorkspaceContext = cache(resolveRequiredWorkspaceContext);

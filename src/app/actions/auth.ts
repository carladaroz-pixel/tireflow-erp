"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authenticateWithPassword } from "@/lib/auth/authenticate";
import {
  listAvailableOrganizations,
  listAvailableStores,
  selectOrganizationContext,
  selectStoreContext,
} from "@/lib/auth/context";
import { createSession, revokeSession, validateSession } from "@/lib/auth/session";
import {
  readSessionToken,
} from "@/lib/auth/web-session";
import { SESSION_COOKIE_BASE, SESSION_COOKIE_NAME } from "@/lib/auth/web-session-policy";

export type LoginState = {
  message: string;
};

const LOGIN_FAILED = "Não foi possível entrar. Verifique os dados informados.";
const CONTEXT_FAILED = "Não foi possível selecionar este acesso.";

async function nextDestination(token: string): Promise<string> {
  const organizations = await listAvailableOrganizations(token);
  if (organizations.length !== 1) {
    return "/contexto";
  }
  await selectOrganizationContext(token, organizations[0].organization.id);
  const stores = await listAvailableStores(token);
  if (stores.length !== 1) {
    return "/contexto";
  }
  await selectStoreContext(token, stores[0].id);
  return "/";
}

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string") {
    return { message: LOGIN_FAILED };
  }

  let token: string | null = null;
  let destination = "/contexto";
  try {
    const user = await authenticateWithPassword(email, password);
    if (!user) return { message: LOGIN_FAILED };
    const created = await createSession(user.id);
    token = created.token;
    (await cookies()).set(SESSION_COOKIE_NAME, token, {
      ...SESSION_COOKIE_BASE,
      expires: created.session.expiresAt,
    });
    destination = await nextDestination(token);
  } catch {
    if (token) {
      const session = await validateSession(token).catch(() => null);
      if (session) await revokeSession(session.id).catch(() => undefined);
      (await cookies()).delete(SESSION_COOKIE_NAME);
    }
    return { message: LOGIN_FAILED };
  }
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) {
    const session = await validateSession(token).catch(() => null);
    if (session) {
      await revokeSession(session.id).catch(() => undefined);
    }
  }
  (await cookies()).delete(SESSION_COOKIE_NAME);
  redirect("/entrar");
}

export async function selectOrganizationAction(formData: FormData): Promise<void> {
  const token = await readSessionToken();
  const organizationId = formData.get("organizationId");
  if (!token || typeof organizationId !== "string") {
    redirect(`/contexto?erro=${encodeURIComponent(CONTEXT_FAILED)}`);
  }
  try {
    await selectOrganizationContext(token, organizationId);
    const stores = await listAvailableStores(token);
    if (stores.length === 1) {
      await selectStoreContext(token, stores[0].id);
      redirect("/");
    }
  } catch {
    redirect(`/contexto?erro=${encodeURIComponent(CONTEXT_FAILED)}`);
  }
  redirect("/contexto");
}

export async function selectStoreAction(formData: FormData): Promise<void> {
  const token = await readSessionToken();
  const storeId = formData.get("storeId");
  if (!token || typeof storeId !== "string") {
    redirect(`/contexto?erro=${encodeURIComponent(CONTEXT_FAILED)}`);
  }
  try {
    await selectStoreContext(token, storeId);
  } catch {
    redirect(`/contexto?erro=${encodeURIComponent(CONTEXT_FAILED)}`);
  }
  redirect("/");
}

"use client";

import { useActionState, useState } from "react";

import { loginAction, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = { message: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form className="tireflow-login-form" action={action}>
      <p className="tireflow-eyebrow">BEM-VINDO DE VOLTA</p>
      <h2>Acesse sua conta</h2>
      <p>Use seu acesso piloto para entrar na organização e loja autorizadas.</p>
      <div className="tireflow-field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="tireflow-field">
        <label htmlFor="password">Senha</label>
        <div className="tireflow-password-field">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? "Ocultar" : "Exibir"}
          </button>
        </div>
      </div>
      {state.message ? (
        <p className="tireflow-form-message" role="alert">{state.message}</p>
      ) : null}
      <button className="tireflow-btn primary" type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Entrar no TireFlow"}
      </button>
      <div className="tireflow-demo-access">
        <strong>Ambiente piloto seguro</strong><br />
        A senha não é armazenada no navegador nem exibida nesta página.
      </div>
    </form>
  );
}

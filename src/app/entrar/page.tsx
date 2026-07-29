import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { validateSession } from "@/lib/auth/session";
import { readSessionToken } from "@/lib/auth/web-session";
import { platformConfig } from "@/lib/tireflow-config";

export default async function TireFlowLogin() {
  const token = await readSessionToken();
  if (token && (await validateSession(token))) redirect("/contexto");
  return (
    <div className="tireflow-login-wrap">
      <div className="tireflow-login">
        <section className="tireflow-login-art">
          <div>
            <div className="tireflow-brand"><span className="tireflow-brand-mark"><span /></span><span><strong>{platformConfig.productName}</strong><small>{platformConfig.productSuffix}</small></span></div>
            <h1>Controle total.<br />Da operação à gestão.</h1>
            <p>{platformConfig.description}. Uma operação segura, rastreável e preparada para crescer.</p>
          </div>
          <small>Ambiente piloto • Acesso protegido</small>
        </section>
        <LoginForm />
      </div>
    </div>
  );
}

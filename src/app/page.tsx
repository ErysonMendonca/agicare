"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/Button";
import { signIn, selectClinic } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);

  // Passo 1: credenciais.
  const [state, formAction, pending] = useActionState(signIn, undefined);
  // Passo 2 (quando o usuário tem várias clínicas): seleção de clínica.
  const [clinicState, clinicAction, clinicPending] = useActionState(
    selectClinic,
    undefined,
  );

  // Quando a clínica ativa foi setada no servidor, o token PRECISA ser
  // re-emitido (refreshSession) para o Access Token Hook carimbar o claim
  // active_clinic_id. Só então navegamos para o dashboard.
  useEffect(() => {
    const refresh = state?.refresh || clinicState?.refresh;
    if (!refresh) return;
    (async () => {
      if (isSupabaseConfigured()) {
        await createClient().auth.refreshSession();
      }
      router.replace("/dashboard");
    })();
  }, [state?.refresh, clinicState?.refresh, router]);

  // Lista de clínicas para o seletor (passo 2). Vem do passo 1 ou de um erro
  // no passo 2 (re-populada).
  const clinics = clinicState?.clinics ?? state?.clinics;
  const showClinicPicker = (state?.needsClinic || clinicState?.needsClinic) && clinics;

  return (
    <div className="bg-brand-gradient flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Logo onDark className="text-5xl" />
        <p className="mt-3 text-sm text-white/90">
          Sistema de Gestão Clínica Inteligente
        </p>
      </div>

      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">
        <h2 className="mb-6 text-center text-2xl font-semibold text-ink">
          {showClinicPicker ? "Selecione a clínica" : "Login"}
        </h2>

        {showClinicPicker ? (
          // ── Passo 2: seleção de clínica (somente PÓS-autenticação) ──
          <form action={clinicAction} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Clínica:
              </span>
              <select
                name="clinicId"
                defaultValue=""
                required
                className="h-10 w-full appearance-none rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="" disabled>
                  Selecione a clínica
                </option>
                {clinics?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            {clinicState?.error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
                {clinicState.error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={clinicPending}>
              {clinicPending ? "Entrando..." : "Continuar"}
            </Button>
          </form>
        ) : (
          // ── Passo 1: credenciais ──
          <form action={formAction} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Usuário:
              </span>
              <input
                id="usuario"
                name="usuario"
                placeholder="Digite seu usuário"
                className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Senha:</span>
              <div className="relative">
                <input
                  id="senha"
                  name="senha"
                  type={showPwd ? "text" : "password"}
                  placeholder="Digite sua senha"
                  className="h-10 w-full rounded-lg border border-line bg-white px-3 pr-10 text-sm placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {state?.error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
                {state.error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        )}

      </div>

      <div className="mt-6 text-center text-xs text-white/80">
        <p>© 2025 AGIcare. Sistema de Gestão Clínica.</p>
        <Link href="/admin/login" className="mt-1 inline-block underline hover:text-white">
          Acesso administrativo
        </Link>
      </div>
    </div>
  );
}

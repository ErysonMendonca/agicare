"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Shield } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/Button";

export default function AdminLoginPage() {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Protótipo (modo demo): qualquer credencial entra.
    router.push("/dashboard");
  }

  return (
    <div className="bg-brand-gradient flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Logo onDark className="text-5xl" />
        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-white">
          <Shield className="h-4 w-4" />
          Painel Administrativo
        </p>
        <p className="mt-1 text-xs text-white/85">
          Área restrita - Acesso exclusivo para administradores
        </p>
      </div>

      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">
        <h2 className="mb-6 text-center text-2xl font-semibold text-ink">
          Login Administrativo
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Usuário:</span>
            <input
              id="usuario"
              defaultValue="admin"
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Senha:</span>
            <div className="relative">
              <input
                id="senha"
                type={showPwd ? "text" : "password"}
                defaultValue="admin123"
                className="h-10 w-full rounded-lg border border-line bg-white px-3 pr-10 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
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

          <Button type="submit" className="w-full">
            Entrar
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted">
          <span className="font-medium text-brand-600">Demo:</span> Usuário:{" "}
          <span className="font-medium text-brand-600">admin</span> | Senha:{" "}
          <span className="font-medium text-brand-600">admin123</span>
        </p>
      </div>

      <div className="mt-6 text-center text-xs text-white/80">
        <p>© 2025 AGIcare. Sistema de Gestão Clínica.</p>
        <Link href="/" className="mt-1 inline-block underline hover:text-white">
          Voltar para login de usuário
        </Link>
      </div>
    </div>
  );
}

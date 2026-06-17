# Auditoria de Segurança — agicare (Fase 5)

Auditor: Diego (AppSec, tech-lead review). Escopo: protótipo Next.js 16 + Supabase Auth + RLS.
Read-only + correções aplicadas pelo tech-lead. Data: 2026-06-12.

## Resumo
Nenhum achado **Crítico**. 2 **Importantes** corrigidos. Demais são **Sugestões** para quando o
backend real entrar (hoje o app usa apenas dados mockados, sem dados reais de paciente).

## Achados

### Importante #1 — Modo demo "fail-open" (CORRIGIDO)
- **Onde:** `src/lib/supabase/config.ts`, `src/lib/supabase/proxy.ts`, `src/app/(app)/layout.tsx`.
- **Risco:** o gate de auth era desativado sempre que o Supabase não estava configurado. Se o app
  fosse implantado em produção sem as variáveis de ambiente, o sistema ficaria **aberto** (sem login).
- **Correção:** adicionado `isDemoMode()` = sem Supabase **e** `NODE_ENV !== 'production'`. Em produção
  sem chaves o proxy passa a **falhar fechado** (redireciona rotas protegidas para `/login`).

### Importante #2 — `CLAUDE.md` versionado (CORRIGIDO)
- **Risco:** o `create-next-app` commitou `CLAUDE.md` antes do `.gitignore`. Convenção do projeto é
  mantê-lo fora do git.
- **Correção:** `git rm --cached CLAUDE.md` (segue no disco). `.claude/` e `CLAUDE.md` agora no `.gitignore`.

### OK — Service-role isolado
- `createServiceClient`/`SUPABASE_SERVICE_ROLE_KEY` aparecem **apenas** em `src/lib/supabase/service.ts`.
  Nenhum import em Client Components. ✓

### OK — Segredos
- Nenhum `.env*` versionado; sem chaves hardcoded (`eyJ...`) no código; `.env.local` só com placeholders. ✓

### OK — RLS (`supabase/migrations/0001_init.sql`)
- RLS habilitada em todas as tabelas de domínio. `medical_records` restrito a `admin`/`medico`.
- Helpers `current_role()`/`is_staff()` com `SECURITY DEFINER` + `search_path = public` (evita recursão
  de RLS e search_path hijacking). ✓

## Sugestões (para a fase de backend real)
- **S1 — Open redirect:** se a tela de login passar a ler `?redirect=`, validar que é caminho relativo
  (começa com `/`, sem `//` nem esquema `http`). Hoje o login ignora o parâmetro (seguro).
- **S2 — Validação Zod:** toda Server Action / Route Handler que receber input deve validar com Zod na borda.
- **S3 — LGPD (dados de saúde):** ao integrar dados reais, não logar CPF/prontuário; aplicar mascaramento
  em UI quando cabível; revisar retenção/minimização; reforçar `requireRole()` em toda página/ação clínica.
- **S4 — Autorização no servidor:** o gate do `proxy.ts` é otimista; cada página/ação sensível deve chamar
  `requireRole(...)` de `src/lib/auth.ts` (reforço real no servidor).
- **S5 — Cookies/headers:** ao publicar, garantir HTTPS, cookies `secure`+`httpOnly` (o `@supabase/ssr`
  já cuida) e cabeçalhos de segurança (CSP) via `next.config`/proxy.

# Guia — Criar o projeto Supabase (agicare)

Siga os passos abaixo. Ao final, cole as 3 chaves no `.env.local` e me avise — eu aplico as
migrations e ligo o Auth real.

## 1. Criar o projeto
1. Acesse https://supabase.com e faça login (pode usar GitHub/Google).
2. **New project** → escolha a Organization (ou crie uma).
3. Preencha:
   - **Name:** `agicare`
   - **Database Password:** gere uma forte e **guarde** (você precisará dela para o banco).
   - **Region:** escolha a mais próxima (ex.: `South America (São Paulo)`).
4. **Create new project** e aguarde ~2 min (provisionamento).

## 2. Pegar as chaves (Project Settings → API)
Copie estes 3 valores:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key (em "Project API keys", revele e copie) → `SUPABASE_SERVICE_ROLE_KEY`
  - ⚠️ A service_role **ignora RLS**. Nunca exponha no front nem comite.

## 3. Colar no `.env.local`
Edite `C:\Users\User\Desktop\dev\agicare\.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NODE_ENV=development
```
> Assim que houver chaves reais, o app **sai do modo demo** e passa a exigir login.

## 4. Aplicar o schema (eu faço, ou você)
Opção A (rápida): no painel do Supabase → **SQL Editor** → cole o conteúdo de
`supabase/migrations/0001_init.sql` e depois `0002_*.sql` → **Run**.
Opção B: instalar a Supabase CLI e rodar `supabase db push` (eu te guio).

## 5. Auth — configuração
- **Authentication → Providers → Email**: habilitado (padrão).
- Para o protótipo, em **Authentication → Sign In/Up**, pode **desabilitar "Confirm email"**
  para facilitar o cadastro de teste.
- Crie um usuário de teste em **Authentication → Users → Add user** e depois promova o papel:
  no SQL Editor → `update public.profiles set role='admin', full_name='Admin' where id='<uuid>';`

Pronto. Me mande os 3 valores (ou confirme que colou no `.env.local`) que eu sigo com o Auth e o CRUD.

## 6. Seed (dados de demonstração)
Rode `npm run seed` para popular o banco (pacientes, agenda, fila, estoque, faturamento, laboratório,
procedimentos, profissionais) e criar os usuários demo abaixo.

### Logins demo (senha: `Agicare2026!`)
| E-mail | Papel |
|--------|-------|
| `admin@agicare.test` | admin |
| `medico@agicare.test` | médico |
| `medico2@agicare.test` | médico |
| `recepcao@agicare.test` | recepção |

> A seed é idempotente — pode rodar quantas vezes quiser (limpa e repovoa as tabelas de domínio).

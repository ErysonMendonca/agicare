-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0022: Custom Access Token Hook (clínica ativa no JWT)
--
-- Carimba o claim app_metadata.active_clinic_id no Access Token, lido por
-- public.current_clinic_id() (0020). É o que faz o multitenant FUNCIONAR:
-- sem este hook, o claim não existe, current_clinic_id() = NULL e a RLS da
-- 0021 trava todo mundo (fail-closed).
--
-- ┌────────────────────────────────────────────────────────────────┐
-- │ PASSOS MANUAIS (o dono executa no Dashboard, NÃO é SQL):        │
-- │  1. Authentication → Hooks → "Custom Access Token" →            │
-- │     habilitar e apontar para public.custom_access_token_hook.   │
-- │  2. Authentication → Settings → reduzir o Access Token (JWT)    │
-- │     expiry para 900s (15 min). Quanto MENOR o TTL, mais rápido  │
-- │     uma troca de clínica/revogação de membership reflete no JWT.│
-- │  3. Aplicar ESTA migration ANTES de habilitar o hook, e o hook  │
-- │     ANTES de aplicar a 0021 em produção.                        │
-- └────────────────────────────────────────────────────────────────┘
--
-- Estratégia de "clínica ativa":
--   • Não há (ainda) coluna de "clínica preferida". Usa-se a PRIMEIRA
--     membership ATIVA do usuário, em ordem determinística
--     (created_at, clinic_id) para ser estável entre tokens.
--   • Se o usuário NÃO tem nenhuma membership ativa → NÃO carimba o claim
--     (fail-closed): o token sai sem active_clinic_id e a RLS nega tudo.
--   • A membership escolhida é VALIDADA contra clinic_members(active) antes
--     de injetar — defesa contra estado inconsistente.
--
-- Segurança (guia oficial Supabase p/ Auth Hooks):
--   • Função INVOKER (NÃO security definer): roda como supabase_auth_admin.
--   • grant execute SOMENTE a supabase_auth_admin; revoke de anon/auth/public.
--   • grant select nas tabelas que o hook lê para supabase_auth_admin.
--
-- Idempotente: create or replace + grants/revokes repetíveis.
-- ════════════════════════════════════════════════════════════════

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
-- INVOKER (default): executa no contexto do supabase_auth_admin. NÃO usar
-- security definer aqui (recomendação oficial p/ Auth Hooks).
as $$
declare
  v_user_id   uuid;
  v_clinic_id uuid;
  v_claims    jsonb;
begin
  v_user_id := (event ->> 'user_id')::uuid;

  -- Clínica ativa = 1ª membership ATIVA, ordem determinística.
  select cm.clinic_id
    into v_clinic_id
  from public.clinic_members cm
  join public.clinics c on c.id = cm.clinic_id and c.active
  where cm.user_id = v_user_id
    and cm.active
  order by cm.created_at asc, cm.clinic_id asc
  limit 1;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);

  if v_clinic_id is not null then
    -- (re)valida que a membership realmente existe e está ativa antes de injetar.
    if exists (
      select 1 from public.clinic_members
       where user_id = v_user_id and clinic_id = v_clinic_id and active
    ) then
      v_claims := jsonb_set(
        v_claims,
        '{app_metadata}',
        coalesce(v_claims -> 'app_metadata', '{}'::jsonb)
          || jsonb_build_object('active_clinic_id', v_clinic_id::text),
        true
      );
    end if;
  end if;
  -- Sem membership ativa → NÃO carimba (fail-closed). RLS da 0021 nega tudo.

  return jsonb_set(event, '{claims}', v_claims, true);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Custom Access Token Hook: injeta app_metadata.active_clinic_id (1ª membership ativa). Fail-closed se o usuário não pertence a nenhuma clínica. Registrar em Dashboard → Auth → Hooks.';

-- ── Permissões (modelo oficial Supabase p/ Auth Hooks) ───────────
-- Só o role do Auth pode executar o hook.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- O hook roda como supabase_auth_admin e precisa LER as tabelas consultadas.
grant usage  on schema public to supabase_auth_admin;
grant select on public.clinic_members to supabase_auth_admin;
grant select on public.clinics        to supabase_auth_admin;

-- (Opcional, recomendado pelo guia) policy explícita permitindo o auth admin
-- ler clinic_members mesmo com RLS — o hook NÃO é security definer.
drop policy if exists clinic_members_auth_admin_read on public.clinic_members;
create policy clinic_members_auth_admin_read on public.clinic_members
  for select to supabase_auth_admin using (true);

drop policy if exists clinics_auth_admin_read on public.clinics;
create policy clinics_auth_admin_read on public.clinics
  for select to supabase_auth_admin using (true);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- 1) DESABILITAR o hook no Dashboard (Auth → Hooks) ANTES de dropar,
--   --    senão o login quebra (hook aponta p/ função inexistente).
--   drop policy if exists clinics_auth_admin_read        on public.clinics;
--   drop policy if exists clinic_members_auth_admin_read on public.clinic_members;
--   revoke select on public.clinics        from supabase_auth_admin;
--   revoke select on public.clinic_members from supabase_auth_admin;
--   revoke execute on function public.custom_access_token_hook(jsonb) from supabase_auth_admin;
--   drop function if exists public.custom_access_token_hook(jsonb);
--   -- 2) restaurar o Access Token expiry padrão (3600s) no Dashboard, se desejado.
-- ════════════════════════════════════════════════════════════════

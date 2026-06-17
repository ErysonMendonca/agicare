-- ════════════════════════════════════════════════════════════════
-- agicare — verificação de COBERTURA de RLS multitenant
--
-- Lista toda tabela em `public` que:
--   • tem RLS habilitada, E
--   • tem coluna clinic_id, E
--   • possui alguma policy cuja expressão (qual OU with_check) NÃO referencia
--     current_clinic_id().
--
-- RESULTADO ESPERADO: VAZIO. Qualquer linha = policy que pode vazar entre
-- clínicas (esqueceu o amarre de tenant). Rodar no SQL Editor após 0020+0021.
--
-- OBS: policies global-por-design (ex.: profiles_*, e as *_auth_admin_read de
-- clinic_members/clinics, que rodam para supabase_auth_admin) aparecem aqui e
-- são EXCEÇÕES CONHECIDAS — estão filtradas abaixo.
-- ════════════════════════════════════════════════════════════════
select
  c.relname                              as tabela,
  p.polname                              as policy,
  pg_get_expr(p.polqual,      p.polrelid) as using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
from pg_policy   p
join pg_class    c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relrowsecurity                                   -- RLS habilitada
  and exists (                                           -- tem coluna clinic_id
    select 1 from pg_attribute a
     where a.attrelid = c.oid
       and a.attname  = 'clinic_id'
       and not a.attisdropped
  )
  -- alguma das expressões NÃO menciona current_clinic_id
  and (
    coalesce(pg_get_expr(p.polqual,      p.polrelid), '') not ilike '%current_clinic_id%'
    or
    coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not ilike '%current_clinic_id%'
  )
  -- exceções conhecidas (policies global-por-design)
  and p.polname not in (
    'clinic_members_auth_admin_read',
    'clinics_auth_admin_read',
    'clinic_members_self_read'   -- self read por user_id (global ao usuário)
  )
order by c.relname, p.polname;

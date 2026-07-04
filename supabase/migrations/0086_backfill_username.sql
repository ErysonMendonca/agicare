-- 0086_backfill_username.sql
-- Backfill de `profiles.username` para os usuários JÁ cadastrados (criados no
-- fluxo antigo por e-mail), mantendo o acesso deles após a virada para login por
-- usuário (0084). Regra combinada com o dono: o username vem da PARTE DO E-MAIL
-- ANTES DO "@" (o identificador que a pessoa já usava).
--
--   joao.oliveira@clinica.com  ->  joao.oliveira
--
-- Saneamento: minúsculo, caracteres fora de [a-z0-9._-] viram ".", múltiplos
-- colapsados. Desempate: em colisão, sufixo numérico (…, nome2, nome3). Só toca
-- linhas com username NULL — idempotente (rodar de novo não altera nada).
--
-- Login continua resolvendo username -> conta; o e-mail real do Auth permanece
-- intacto (nada é alterado em auth.users). Rollback ao pé do arquivo.

with base as (
  select
    p.id,
    -- local-part saneado; nullif evita gerar username vazio
    nullif(
      regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9._-]+', '.', 'g'),
      ''
    ) as uname
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username is null
    and u.email is not null
),
saneado as (
  select
    id,
    -- garante o mínimo de 3 caracteres exigido pelo app (pad com fragmento do id)
    case when length(uname) < 3 then uname || substr(id::text, 1, 4) else uname end as uname
  from base
  where uname is not null
),
ranked as (
  select
    id,
    uname,
    row_number() over (partition by uname order by id) as rn
  from saneado
)
update public.profiles p
set username = left(
      case when r.rn = 1 then r.uname else r.uname || r.rn::text end,
      40  -- respeita o teto de 40 do app
    )
from ranked r
where p.id = r.id
  and p.username is null;

-- Rollback (reverte apenas o que este backfill preencheu; perde usernames
-- definidos manualmente depois — use com cuidado):
--   update public.profiles set username = null where username is not null;

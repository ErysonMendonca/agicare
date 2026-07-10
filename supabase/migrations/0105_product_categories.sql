-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0105: catálogo HIERÁRQUICO de categorias de produto
--
-- (A) public.product_categories — árvore de 3 níveis por clínica:
--       nível 1 = Grupo · nível 2 = Classificação · nível 3 = Subclassificação
--     Multitenant (clinic_id) + RLS no padrão *_staff_all (0021/0050/0080).
-- (B) SEED idempotente: cria os grupos (nível 1) de cada clínica a partir de
--     public.attendance_options where category='grupo_produto', preservando
--     label e sort_order. NADA é apagado de attendance_options.
--
-- Aditiva e idempotente (create table/index if not exists, drop policy if
--   exists, insert ... where not exists). Sem limpeza de dados.
-- DEPENDE de: 0001 (clinics, helpers is_staff()/current_clinic_id()),
--             0050 (attendance_options), 0080 (seed de category='grupo_produto').
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs (porta 6543).
-- ════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- (A) Tabela da árvore
--   · parent_id auto-referente com ON DELETE CASCADE → apagar um Grupo apaga
--     Classificações e Subclassificações abaixo dele (a cascata é recursiva).
--   · level é redundante com a profundidade, mas materializado para permitir
--     filtro/índice barato e travar a árvore em exatamente 3 níveis.
--   · Coerência level×parent: raiz (1) SEM pai; filhos (2 e 3) COM pai.
--     O check NÃO consegue impedir, sozinho, que um nível 3 aponte para um
--     nível 1 — isso é validado na Server Action (ver lib/actions).
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.product_categories (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  parent_id  uuid references public.product_categories(id) on delete cascade,
  level      smallint not null check (level in (1, 2, 3)),
  label      text not null,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_nivel1_sem_pai
    check (level <> 1 or parent_id is null),
  constraint product_categories_nivel_filho_com_pai
    check (level = 1 or parent_id is not null)
);

-- Unicidade case-insensitive de rótulo ENTRE IRMÃOS (mesmo pai, mesma clínica).
-- parent_id é NULL na raiz e NULL nunca colide em unique → normalizamos com o
-- uuid-zero (sentinela) para que dois Grupos homônimos na mesma clínica batam.
create unique index if not exists uq_product_categories_irmaos
  on public.product_categories (
    clinic_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(label)
  );

-- Query quente: listar os filhos de um nó, na ordem de exibição.
create index if not exists idx_product_categories_clinic_parent_sort
  on public.product_categories (clinic_id, parent_id, sort_order);

-- ─────────────────────────────────────────────────────────────────
-- RLS — mesmo padrão das tabelas-filhas de produto (0080):
--   staff da clínica ativa gerencia tudo; qualquer outro papel não enxerga
--   nada (fail-closed via current_clinic_id()). Catálogo de parametrização,
--   sem dado clínico → staff_all basta; escrita é restrita a admin na camada
--   de Server Action (autorização real no servidor).
-- ─────────────────────────────────────────────────────────────────
alter table public.product_categories enable row level security;
drop policy if exists product_categories_staff_all on public.product_categories;
create policy product_categories_staff_all on public.product_categories
  for all
  using      (public.is_staff() and clinic_id = public.current_clinic_id())
  with check (public.is_staff() and clinic_id = public.current_clinic_id());

-- ════════════════════════════════════════════════════════════════
-- (B) SEED — grupos (nível 1) a partir de attendance_options.
--   Idempotente por WHERE NOT EXISTS sobre a MESMA regra do índice único
--   (clinic_id + raiz + lower(label)). Reexecutar não duplica nem sobrescreve
--   rótulos já editados pelo admin. attendance_options fica intacta.
-- ════════════════════════════════════════════════════════════════
insert into public.product_categories (clinic_id, parent_id, level, label, sort_order)
select ao.clinic_id, null, 1, ao.label, coalesce(ao.sort_order, 0)
from public.attendance_options ao
where ao.category = 'grupo_produto'
  and not exists (
    select 1
    from public.product_categories pc
    where pc.clinic_id = ao.clinic_id
      and pc.parent_id is null
      and lower(pc.label) = lower(ao.label)
  );

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   -- derruba tabela, policy, índices e TODA a árvore (cascata interna).
--   drop table if exists public.product_categories;
--   -- attendance_options NÃO é tocada por esta migration → nada a reverter lá.
--
-- IMPACTO: 100% aditivo. Nenhuma tabela existente é alterada; stock_products
--   continua com product_group/classification/subclassification em texto livre
--   (a migração desses textos p/ FK é assunto de uma migration futura, quando a
--   tela estiver em produção e o de-para de rótulos for conhecido).
--   O seed só INSERE grupos que ainda não existem.
-- HANDOFF: backend-dev/frontend-dev — a tela de Cadastro de Produtos deve passar
--   a ler Grupo/Classificação/Subclassificação de product_categories (via
--   listProductCategories) em vez de attendance_options('grupo_produto') +
--   texto livre. Enquanto as duas fontes coexistirem, novos grupos criados no
--   catálogo hierárquico NÃO aparecem em attendance_options (e vice-versa).
-- ════════════════════════════════════════════════════════════════

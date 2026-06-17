-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0023: DEFAULT de clinic_id via trigger (rede de segurança)
--
-- DEFENSE IN DEPTH para o multitenant. Padrão HÍBRIDO de preenchimento do
-- clinic_id, em duas camadas:
--
--   1) RESPONSABILIDADE PRIMÁRIA — a aplicação:
--      o backend SEMPRE seta clinic_id explicitamente nos INSERTs, via
--      requireClinic() (clínica ativa do contexto autenticado). Esta é a
--      fonte de verdade e NÃO depende deste trigger.
--
--   2) ÚLTIMA REDE DE SEGURANÇA — este trigger (BEFORE INSERT):
--      se um INSERT autenticado chegar com clinic_id NULL (esquecimento,
--      caminho novo, INSERT cru), o trigger carimba com current_clinic_id()
--      (claim app_metadata.active_clinic_id do JWT). Isso DESTRAVA o caminho
--      autenticado sem obrigar todo INSERT a repetir o clinic_id.
--
-- POR QUE NÃO USAR `DEFAULT` DE COLUNA:
--   um DEFAULT fixo exigiria hardcode de uma clínica (vazaria tenant) e um
--   DEFAULT por expressão (current_clinic_id()) não cobre o caso de NULL
--   EXPLÍCITO vindo do caller. O trigger só age quando clinic_id IS NULL,
--   preservando qualquer valor já informado (inclusive por service-role).
--
-- SERVICE-ROLE (ignora RLS e NÃO tem JWT de usuário):
--   current_clinic_id() retorna NULL fora de um contexto com claim. Logo,
--   se o service-role inserir SEM setar clinic_id, o trigger NÃO inventa
--   clínica e o NOT NULL (imposto na 0020) FALHA de propósito — erro
--   barulhento, nunca preenchimento silencioso. Isso é INTENCIONAL: força
--   o caller service-role a declarar explicitamente o tenant alvo. Nunca
--   há fallback para clínica hardcoded.
--
-- ORDEM DE APLICAÇÃO:
--   DEPOIS da 0020 (precisa das colunas clinic_id já criadas e NOT NULL).
--   Independe da 0021/0022, mas o natural é aplicar junto/logo após a 0020.
--
-- Idempotente: create or replace + drop trigger if exists por tabela.
-- Aplicar MANUALMENTE no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- 1) Função de trigger: preenche clinic_id SÓ quando vem nulo.
--    SECURITY INVOKER (roda com os privilégios e o JWT de quem insere,
--    para que current_clinic_id() leia o claim do usuário corrente) +
--    search_path fixo (anti captura de search_path).
-- ════════════════════════════════════════════════════════════════
create or replace function public.set_clinic_id_default()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Só carimba quando o caller NÃO informou clinic_id. Se já veio um valor
  -- (app via requireClinic, ou service-role explícito), preserva-o intacto.
  if new.clinic_id is null then
    -- current_clinic_id(): claim app_metadata.active_clinic_id do JWT.
    -- Fora de contexto com JWT (ex.: service-role) retorna NULL — e aí o
    -- NOT NULL da coluna falha DE PROPÓSITO (erro barulhento). NUNCA usar
    -- default fixo / clínica hardcoded aqui.
    new.clinic_id := public.current_clinic_id();
  end if;
  return new;
end;
$$;

comment on function public.set_clinic_id_default() is
  'Rede de segurança multitenant (BEFORE INSERT): preenche clinic_id com current_clinic_id() APENAS quando o INSERT chega com clinic_id NULL. Nunca usa default fixo; service-role sem claim mantém NULL e bate no NOT NULL de propósito.';

-- ════════════════════════════════════════════════════════════════
-- 2) Aplica o trigger BEFORE INSERT em TODAS as tabelas que receberam
--    clinic_id na 0020: as 37 do Grupo A + 7 do Grupo B + role_permissions.
--    (= 45 tabelas.)
--
--    NÃO inclui (intencional):
--      • clinics            — é o próprio tenant (id), não tem clinic_id;
--      • clinic_members     — clinic_id é a clínica GERENCIADA, setada
--                             explicitamente; não é tenant desnormalizado;
--      • permission_templates — catálogo GLOBAL, sem clinic_id.
--
--    Lista copiada EXATAMENTE da 0020 (itens 4/5/6 + 7b role_permissions).
-- ════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    -- Grupo A (raiz / independentes) + especiais
    'professionals','patients','appointments','medical_records',
    'procedures','queue_entries','stock_products','billable_events','lab_cases',
    'vital_signs','schedules','schedule_blocks',
    'suppliers','dispensations','purchase_requests','inventories',
    'anamneses','prescriptions','care_orders','prescription_checks',
    'certificates','consents',
    'nursing_notes','sae_records','care_checks','fluid_balance',
    'nursing_evolutions','assessment_scales','nursing_procedures',
    'tiss_batches','tiss_guides','billing_items',
    'clinic_settings','access_logs','exam_orders','prosthetic_orders',
    -- Grupo B (filhas)
    'stock_movements','dispensation_items','quotations','inventory_counts',
    'prescription_items','fluid_balance_entries','prosthetic_files',
    -- Re-chaveada na 0020 (item 7b): também tem clinic_id NOT NULL
    'role_permissions'
  ] loop
    -- drop antes de criar → idempotente.
    execute format(
      'drop trigger if exists trg_set_clinic_id_%I on public.%I;',
      t, t
    );
    execute format(
      'create trigger trg_set_clinic_id_%I
         before insert on public.%I
         for each row execute function public.set_clinic_id_default();',
      t, t
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual) — comentado:
--
--   -- 2) dropar os 45 triggers
--   do $$
--   declare t text;
--   begin
--     foreach t in array array[
--       'professionals','patients','appointments','medical_records',
--       'procedures','queue_entries','stock_products','billable_events','lab_cases',
--       'vital_signs','schedules','schedule_blocks',
--       'suppliers','dispensations','purchase_requests','inventories',
--       'anamneses','prescriptions','care_orders','prescription_checks',
--       'certificates','consents',
--       'nursing_notes','sae_records','care_checks','fluid_balance',
--       'nursing_evolutions','assessment_scales','nursing_procedures',
--       'tiss_batches','tiss_guides','billing_items',
--       'clinic_settings','access_logs','exam_orders','prosthetic_orders',
--       'stock_movements','dispensation_items','quotations','inventory_counts',
--       'prescription_items','fluid_balance_entries','prosthetic_files',
--       'role_permissions'
--     ] loop
--       execute format('drop trigger if exists trg_set_clinic_id_%I on public.%I;', t, t);
--     end loop;
--   end $$;
--   -- 1) dropar a função
--   drop function if exists public.set_clinic_id_default();
--
-- IMPACTO de reverter: o app continua funcionando (ele já seta clinic_id
-- explicitamente via requireClinic). Perde-se apenas a rede de segurança:
-- um INSERT autenticado que esqueça o clinic_id passa a falhar direto no
-- NOT NULL, em vez de ser carimbado. NÃO destrói dados.
-- ════════════════════════════════════════════════════════════════

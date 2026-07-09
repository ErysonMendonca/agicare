-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0099
-- Ajuste de status de agendamentos (enum `appointment_status`)
-- ════════════════════════════════════════════════════════════════
--
-- ⚠️ INCIDENTE (09/07/2026): esta migration continha, no passo 1, uma
-- "limpeza de dados de teste":
--
--     DELETE FROM public.appointments CASCADE;
--     DELETE FROM public.queue_entries CASCADE;
--
-- Ela foi escrita para um banco de desenvolvimento, mas o runner a aplicou no
-- banco de PRODUÇÃO durante uma reconciliação do ledger `schema_migrations`.
-- Apagou TODOS os agendamentos, TODA a fila de atendimento e, por
-- `on delete cascade`, todas as `procedure_executions`.
--
-- Os DELETEs foram REMOVIDOS. Nunca coloque limpeza de dados numa migration
-- versionada: migrations rodam em todo ambiente, inclusive produção. Dado de
-- teste se limpa por seed/script explícito, fora de `supabase/migrations/`.
--
-- Se você precisa reaplicar esta migration num banco novo, ela agora é segura:
-- só acrescenta valores ao enum (idempotente).

-- 1) Adição dos novos status ao Enum `appointment_status`
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'aguardando_recepcao';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'em_atendimento_recepcao';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'aguardando_profissional';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'em_atendimento_profissional';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'checkout';

-- Observação: o valor 'concluido' continuará existindo no banco, 
-- mas na UI será rotulado como "Finalizado".
-- O valor 'agendado' permanece inalterado.

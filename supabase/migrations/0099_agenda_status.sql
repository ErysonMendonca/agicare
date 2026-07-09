-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0099
-- Ajuste de status de agendamentos e limpeza de dados de teste
-- ════════════════════════════════════════════════════════════════

-- 1) Limpeza de agendamentos e filas (dados de teste)
DELETE FROM public.appointments CASCADE;
DELETE FROM public.queue_entries CASCADE;

-- 2) Adição dos novos status ao Enum `appointment_status`
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'aguardando_recepcao';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'em_atendimento_recepcao';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'aguardando_profissional';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'em_atendimento_profissional';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'checkout';

-- Observação: o valor 'concluido' continuará existindo no banco, 
-- mas na UI será rotulado como "Finalizado".
-- O valor 'agendado' permanece inalterado.

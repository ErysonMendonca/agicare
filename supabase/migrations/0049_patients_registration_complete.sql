-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0049: cadastro de paciente "incompleto" (avulso)
--
-- O novo fluxo de agendamento avulso permite criar um paciente com o MÍNIMO
-- (Nome, Telefone, CPF) na hora de marcar, sem o cadastro completo. Esse
-- paciente fica pendente e tem o cadastro COMPLETADO depois, no check-in da
-- recepção (demais dados: nascimento, e-mail, endereço, convênio, etc.).
--
--   registration_complete (boolean, NOT NULL, default true):
--     - true  = cadastro completo (todos os pacientes existentes, via default,
--               são considerados completos — preserva a base atual).
--     - false = paciente avulso, criado só com Nome/Telefone/CPF; vira true
--               quando a recepção completa o cadastro no check-in.
--
-- Default true é proposital: garante backfill correto das linhas existentes
-- sem UPDATE (já tinham cadastro completo). O fluxo avulso passa explicitamente
-- registration_complete=false na criação.
--
-- CPF já é único por clínica (índice parcial uq_patients_clinic_cpf, 0046) —
-- nada a fazer aqui quanto a anti-duplicidade. RLS de patients é staff-based
-- (0001 + multitenant) e NÃO muda: RLS é por linha, coluna nova herda as
-- policies. Aditiva e idempotente. DEPENDE de: 0001 (patients), 0046 (CPF unq).
-- NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

alter table public.patients
  add column if not exists registration_complete boolean not null default true;

comment on column public.patients.registration_complete is
  'false = paciente AVULSO criado só com Nome/Telefone/CPF no agendamento; o cadastro é completado no check-in (recepção), virando true. true = cadastro completo (default; todos os pacientes pré-existentes).';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual):
--   alter table public.patients drop column if exists registration_complete;
--
-- IMPACTO: aditivo, com default true — sem perda de dados nem reescrita lógica
-- das linhas existentes ao aplicar.
-- HANDOFF: backend-dev — criar paciente avulso com registration_complete=false;
--   no check-in, validar campos obrigatórios e setar registration_complete=true.
--   frontend-dev — sinalizar visualmente pacientes pendentes (=false).
-- ════════════════════════════════════════════════════════════════

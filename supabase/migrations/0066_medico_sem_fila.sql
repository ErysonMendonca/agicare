-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0066: médico não acessa a Fila de Atendimento
--
-- Decisão do produto: o MÉDICO não vê os pacientes na tela de "Fila de
-- Atendimento". A lista dos pacientes dele (mesma regra de especialidade +
-- profissional atribuído/livre, PR #53) fica APENAS na tela de PRONTUÁRIO.
--
-- Como as permissões vêm de role_permissions (semeado por clínica a partir de
-- permission_templates), rebaixamos can_view do módulo 'fila' para o papel
-- 'medico' em DOIS lugares:
--   1) permission_templates ('default')  → novas clínicas já nascem assim;
--   2) role_permissions (todas as clínicas) → clínicas existentes.
--
-- Observação: a leitura de queue_entries é gateada por is_staff() na RLS
-- (0021), NÃO por can_view('fila'); então o médico CONTINUA lendo a fila na
-- tela de Prontuário. Esta migration só afeta o gate de MÓDULO (menu + página
-- /fila via requireView). Idempotente. NÃO APLICADA automaticamente.
-- ════════════════════════════════════════════════════════════════

-- 1) Template 'default' (fonte das novas clínicas).
update public.permission_templates
  set can_view = false
  where template = 'default' and role = 'medico' and module = 'fila';

-- 2) Clínicas já existentes.
update public.role_permissions
  set can_view = false, updated_at = now()
  where role = 'medico' and module = 'fila';

-- ════════════════════════════════════════════════════════════════
-- Rollback (manual) — reabilita a Fila para o médico:
--   update public.permission_templates set can_view = true
--     where template='default' and role='medico' and module='fila';
--   update public.role_permissions set can_view = true, updated_at = now()
--     where role='medico' and module='fila';
-- ════════════════════════════════════════════════════════════════

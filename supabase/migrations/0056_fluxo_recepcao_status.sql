-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0056: etapa de RECEPÇÃO explícita no fluxo da fila
--
-- Desdobra o atendimento da recepção em status próprios, separando-o do
-- atendimento clínico do profissional:
--
--   aguardando            → na fila, recepção ainda não atendeu (já existia)
--   na_recepcao  (NOVO)   → recepção atendendo (modal "Dados de Atendimento")
--   aguardando_atendimento(NOVO) → recepção concluiu; aguardando o profissional
--   em_atendimento        → profissional atendendo (já existia)
--
-- Fluxo (motor em attendance-flow.shared.ts):
--   recepcao    = ['aguardando', 'na_recepcao']
--   triagem     = ['triagem']            (opcional, inalterada)
--   atendimento = ['aguardando_atendimento', 'chamado', 'em_atendimento']
--
-- ⚠️ ALTER TYPE ... ADD VALUE NÃO é transacional (erro 25001 dentro de bloco
--    de transação). O runner (scripts/migrate.mjs) roda em autocommit por
--    statement — OK. Aditiva e idempotente (add value if not exists).
--    DEPENDE de: 0002 (queue_status), 0053 (valor 'triagem').
--    NÃO APLICADA automaticamente — aplicar via scripts/migrate.mjs.
-- ════════════════════════════════════════════════════════════════

alter type public.queue_status add value if not exists 'na_recepcao';
alter type public.queue_status add value if not exists 'aguardando_atendimento';

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK (manual): valores de enum NÃO podem ser removidos no Postgres sem
-- recriar o tipo. Como são aditivos e o app trata status desconhecidos com
-- fallback, deixar os valores não causa impacto. Sem rollback automático.
--
-- IMPACTO: aditivo. Entradas existentes seguem nos status atuais; os novos só
-- passam a ser usados a partir do deploy do código deste fluxo.
-- ════════════════════════════════════════════════════════════════

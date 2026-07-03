-- 0075 — Recusa de solicitação de retirada (dispensação)
-- Adiciona o motivo da recusa. O status 'cancelado' já existe no enum
-- dispensation_status (0006); aqui só falta onde guardar a justificativa.
-- Coluna nullable: só preenchida quando status = 'cancelado' (recusa).

alter table public.dispensations
  add column if not exists cancel_reason text;

comment on column public.dispensations.cancel_reason is
  'Motivo da recusa (preenchido quando status = cancelado). Ver action recusarDispensacao.';

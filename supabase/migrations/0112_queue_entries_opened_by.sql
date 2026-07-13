-- 0112 — Responsável pelo Documento (quem ABRIU o atendimento no check-in).
-- Aditiva e idempotente: grava, no ato do check-in (checkInTotem), quem abriu
-- a entrada da fila para aparecer na "Ficha de Detalhe do Atendimento".
-- Sem backfill, sem índice, sem RLS nova (herda as políticas de queue_entries).

alter table public.queue_entries
  add column if not exists opened_by uuid references public.profiles (id),
  add column if not exists opened_by_name text,
  add column if not exists opened_by_role text;

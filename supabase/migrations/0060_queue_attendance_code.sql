-- 0060 — Numeração de ATENDIMENTO (ficha) por entrada na fila.
-- Código ALEATÓRIO de 6 dígitos, ÚNICO por clínica (não recicla), SEPARADO da
-- senha (ticket_code). Acompanha o paciente por recepção → triagem → atendimento.
-- Aditiva e idempotente.

ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS attendance_code text;

-- Backfill dos registros existentes: precisa apenas ser ÚNICO por clínica.
-- Usa um sequencial a partir de 100000 por ordem de criação (os NOVOS códigos
-- serão sorteados aleatoriamente pela aplicação no check-in).
WITH numbered AS (
  SELECT
    id,
    (100000 + (row_number() OVER (PARTITION BY clinic_id ORDER BY created_at, id))::bigint - 1)::text AS code
  FROM queue_entries
  WHERE attendance_code IS NULL
)
UPDATE queue_entries q
SET attendance_code = numbered.code
FROM numbered
WHERE q.id = numbered.id;

-- Unicidade por clínica (a aplicação sorteia e tenta de novo em caso de colisão).
CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_entries_clinic_attendance_code
  ON queue_entries (clinic_id, attendance_code);

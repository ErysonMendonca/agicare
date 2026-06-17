-- ════════════════════════════════════════════════════════════════
-- agicare — migration 0046: CPF/CNS únicos por clínica (A1)
--
-- A anti-duplicidade de CPF/CNS era só no app (checagem TOCTOU, sem barreira no
-- banco) — duas gravações concorrentes criavam duplicata. Esta migration cria
-- índices ÚNICOS PARCIAIS por clínica, normalizando por DÍGITOS (regexp_replace)
-- para que "123.456.789-09" e "12345678909" colidam. NULL/vazio não participam.
--
-- Multitenant: unicidade é POR clínica (clinic_id no índice) — o mesmo CPF pode
-- existir em clínicas diferentes (pacientes distintos por tenant).
--
-- ⚠️ APLICAÇÃO: se já houver duplicata histórica (mesmo CPF/CNS normalizado na
-- mesma clínica), a criação do índice FALHA. Rodar antes a consulta de
-- diagnóstico (no fim deste arquivo) e resolver as duplicatas. Idempotente
-- (IF NOT EXISTS). DEPENDE de: 0020 (clinic_id em patients).
-- ════════════════════════════════════════════════════════════════

create unique index if not exists uq_patients_clinic_cpf
  on public.patients (clinic_id, regexp_replace(cpf, '\D', '', 'g'))
  where cpf is not null and regexp_replace(cpf, '\D', '', 'g') <> '';

create unique index if not exists uq_patients_clinic_cns
  on public.patients (clinic_id, regexp_replace(cns, '\D', '', 'g'))
  where cns is not null and regexp_replace(cns, '\D', '', 'g') <> '';

-- ════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO (rodar ANTES de aplicar, se a criação falhar) — lista duplicatas:
--   select clinic_id, regexp_replace(cpf,'\D','','g') as cpf_norm, count(*)
--     from public.patients
--    where cpf is not null and regexp_replace(cpf,'\D','','g') <> ''
--    group by 1,2 having count(*) > 1;
--   (idem para cns)
--
-- ROLLBACK (manual):
--   drop index if exists public.uq_patients_clinic_cpf;
--   drop index if exists public.uq_patients_clinic_cns;
-- ════════════════════════════════════════════════════════════════

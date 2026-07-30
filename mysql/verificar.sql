-- ════════════════════════════════════════════════════════════════
-- Conferência da importação do agicare em MySQL/MariaDB.
--
--   mysql -u root agicare --force --default-character-set=utf8mb4 \
--        < mysql\verificar.sql
--
-- As duas flags são necessárias:
--   --force                       o bloco 6 provoca erros de propósito; sem
--                                 isso o cliente aborta no primeiro e os
--                                 testes seguintes não rodam.
--   --default-character-set=utf8mb4  diz ao cliente que ESTE ARQUIVO está em
--                                 UTF-8. Sem isso, no console do Windows os
--                                 acentos dos literais SQL chegam corrompidos.
--
-- Cada bloco imprime "esperado" ao lado do "encontrado" para dar para
-- comparar de bate-pronto.
-- ════════════════════════════════════════════════════════════════

SELECT '=== 1. ESTRUTURA ===' AS ``;

SELECT 'tabelas'      AS item, 84  AS esperado, COUNT(*) AS encontrado
  FROM information_schema.tables
 WHERE table_schema = 'agicare' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'colunas', 1083, COUNT(*)
  FROM information_schema.columns WHERE table_schema = 'agicare'
UNION ALL
SELECT 'chaves estrangeiras', 247, COUNT(*)
  FROM information_schema.table_constraints
 WHERE table_schema = 'agicare' AND constraint_type = 'FOREIGN KEY'
UNION ALL
SELECT 'colunas ENUM', 31, COUNT(*)
  FROM information_schema.columns
 WHERE table_schema = 'agicare' AND data_type = 'enum'
UNION ALL
SELECT 'colunas geradas', 10, COUNT(*)
  FROM information_schema.columns
 WHERE table_schema = 'agicare' AND extra LIKE '%GENERATED%';


SELECT '=== 2. DADOS SEMEADOS ===' AS ``;

SELECT 'cid_codes'            AS tabela, 15104 AS esperado, COUNT(*) AS encontrado FROM cid_codes
UNION ALL SELECT 'attendance_options',   139, COUNT(*) FROM attendance_options
UNION ALL SELECT 'permission_templates',  72, COUNT(*) FROM permission_templates
UNION ALL SELECT 'role_permissions',      72, COUNT(*) FROM role_permissions
UNION ALL SELECT 'product_categories',     3, COUNT(*) FROM product_categories
UNION ALL SELECT 'consent_templates',      1, COUNT(*) FROM consent_templates
UNION ALL SELECT 'clinics',                1, COUNT(*) FROM clinics
UNION ALL SELECT 'clinic_settings',        1, COUNT(*) FROM clinic_settings;


SELECT '=== 3. ACENTUAÇÃO (utf8mb4) ===' AS ``;
-- Testa por CONTAGEM DE BYTES em vez de comparar com um literal acentuado:
-- LENGTH() conta bytes, CHAR_LENGTH() conta caracteres. Se bytes > caracteres,
-- há caractere multibyte gravado — ou seja, o acento chegou como UTF-8 de
-- verdade. Assim o teste não depende do charset do console nem do arquivo.
SELECT 'descrições com acento' AS ``, COUNT(*) AS encontrado,
       'deve ser > 0' AS esperado
  FROM cid_codes WHERE LENGTH(description) > CHAR_LENGTH(description);

-- Amostra para inspeção visual (só legível se o console estiver em UTF-8):
SELECT code, description, LENGTH(description) AS bytes,
       CHAR_LENGTH(description) AS caracteres
  FROM cid_codes
 WHERE LENGTH(description) > CHAR_LENGTH(description)
 ORDER BY code LIMIT 3;


SELECT '=== 4. CONTA ADMIN ===' AS ``;
-- Precisa vir 1 linha, com role admin nas duas pontas e a clínica vinculada.
SELECT u.email, p.full_name, p.role AS papel_perfil,
       cm.role AS papel_clinica, c.name AS clinica,
       LEFT(u.encrypted_password, 7) AS hash_prefixo
  FROM auth_users u
  JOIN profiles p       ON p.id = u.id
  JOIN clinic_members cm ON cm.user_id = u.id
  JOIN clinics c        ON c.id = cm.clinic_id
 WHERE u.email = 'admin@agicare.local';


SELECT '=== 5. CONFIGURAÇÃO DO SISTEMA ===' AS ``;
SELECT clinic_name, language, timezone, currency,
       attendance_flow AS fluxo_atendimento
  FROM clinic_settings;


SELECT '=== 6. AS CONSTRAINTS FUNCIONAM? ===' AS ``;
-- Os três testes abaixo devem FALHAR com erro. Se algum passar sem erro,
-- a regra correspondente não foi para o banco.

SELECT 'Teste A: CHECK deve rejeitar level fora de (1,2,3)' AS ``;
-- Esperado: ERROR 4025 (MariaDB) / 3819 (MySQL) — CONSTRAINT ... failed
INSERT INTO product_categories (clinic_id, level, label)
VALUES ('00000000-0000-0000-0000-000000000001', 99, 'Nivel Invalido');

SELECT 'Teste B: ENUM deve rejeitar papel inexistente' AS ``;
-- Esperado: ERROR 1265 — Data truncated for column 'role'
INSERT INTO profiles (id, full_name, role)
VALUES (UUID(), 'Teste', 'papel_que_nao_existe');

SELECT 'Teste C: coluna gerada + UNIQUE (colisão por maiúscula/minúscula)' AS ``;
-- O índice único é sobre LOWER(name) numa coluna VIRTUAL: 'Cargo X' e
-- 'CARGO X' têm que colidir. A 1ª inserção passa, a 2ª deve dar
-- ERROR 1062 — Duplicate entry.
INSERT INTO cargos (clinic_id, name, base_role)
VALUES ('00000000-0000-0000-0000-000000000001', 'Cargo Teste Unico', 'recepcao');
INSERT INTO cargos (clinic_id, name, base_role)
VALUES ('00000000-0000-0000-0000-000000000001', 'CARGO TESTE UNICO', 'recepcao');

SELECT 'Teste D: coluna gerada normaliza CPF' AS ``;
-- gen_uq_patients_clinic_cpf_1 = REGEXP_REPLACE(cpf, '[^0-9]', '').
-- Esperado: cpf_normalizado = 12345678909 (só dígitos).
SET FOREIGN_KEY_CHECKS = 0;
INSERT INTO patients (clinic_id, full_name, cpf)
VALUES ('00000000-0000-0000-0000-000000000001', 'Paciente Teste', '123.456.789-09');
SELECT cpf, gen_uq_patients_clinic_cpf_1 AS cpf_normalizado
  FROM patients WHERE full_name = 'Paciente Teste';
SET FOREIGN_KEY_CHECKS = 1;


SELECT '=== 7. LIMPEZA DO TESTE ===' AS ``;
DELETE FROM cargos   WHERE name LIKE '%TESTE UNICO%';
DELETE FROM patients WHERE full_name = 'Paciente Teste';
DELETE FROM product_categories WHERE label = 'Nivel Invalido';
SELECT 'resíduo de teste (deve ser 0)' AS ``,
       (SELECT COUNT(*) FROM cargos   WHERE name LIKE '%TESTE UNICO%')
     + (SELECT COUNT(*) FROM patients WHERE full_name = 'Paciente Teste') AS restantes;

// Monta o arquivo final: schema + conta admin + seeds + notas de migração.
import { readFileSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";

const schema = readFileSync("/tmp/pgtest/parte_schema.sql", "utf8");
const seeds = readFileSync("/tmp/pgtest/parte_seeds.sql", "utf8");
const avisos = JSON.parse(readFileSync("/tmp/pgtest/avisos.json", "utf8"));
const resumo = JSON.parse(readFileSync("/tmp/pgtest/resumo_seeds.json", "utf8"));

const CLINIC_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_ID = "00000000-0000-0000-0000-0000000000a1";
const SENHA = "Agicare@2026";
const HASH = bcrypt.hashSync(SENHA, 10);

const admin = `

-- ════════════════════════════════════════════════════════════════
-- CONTA ADMIN
--
-- No Supabase o login vivia em auth.users (fora do schema public) e o
-- papel em profiles.role. Aqui a conta é criada nas três tabelas que a
-- aplicação usa para montar a sessão:
--   auth_users     → credencial (e-mail + hash da senha)
--   profiles       → papel do usuário (role = 'admin')
--   clinic_members → vínculo com a clínica (multitenant)
--
--   e-mail : admin@agicare.local
--   senha  : ${SENHA}
--
-- O hash abaixo é bcrypt (custo 10) da senha acima — já funcional.
-- ⚠  TROQUE ESSA SENHA no primeiro acesso: ela está em texto claro
--    neste arquivo, que provavelmente vai para o controle de versão.
-- ════════════════════════════════════════════════════════════════

INSERT INTO \`auth_users\`
  (\`id\`, \`email\`, \`encrypted_password\`, \`email_confirmed_at\`, \`raw_user_meta_data\`)
VALUES
  ('${ADMIN_ID}', 'admin@agicare.local',
   '${HASH}',
   CURRENT_TIMESTAMP(6),
   '{"full_name":"Administrador","role":"admin"}');

INSERT INTO \`profiles\` (\`id\`, \`full_name\`, \`role\`, \`username\`)
VALUES ('${ADMIN_ID}', 'Administrador', 'admin', 'admin');

INSERT INTO \`clinic_members\` (\`clinic_id\`, \`user_id\`, \`role\`, \`active\`)
VALUES ('${CLINIC_ID}', '${ADMIN_ID}', 'admin', 1);
`;

const notas = `

-- ════════════════════════════════════════════════════════════════
-- FIM DA IMPORTAÇÃO
-- ════════════════════════════════════════════════════════════════
SET FOREIGN_KEY_CHECKS = 1;


-- ════════════════════════════════════════════════════════════════
-- O QUE ESTE ARQUIVO CONTÉM
-- ════════════════════════════════════════════════════════════════
--
-- ESTRUTURA
--   · 83 tabelas do schema public + auth_users (substituta de auth.users)
--   · 25 enums Postgres convertidos em ENUM nativo do MySQL
--   · Todas as chaves primárias, únicas e estrangeiras
--   · Índices secundários (ver ressalva sobre índices parciais abaixo)
--   · CHECK constraints (os que têm equivalente em MySQL)
--
-- DADOS SEMEADOS
${resumo.map((r) => `--   · ${String(r.linhas).padStart(6)}  ${r.tabela}`).join("\n")}
--   · ${"     1"}  conta admin (auth_users + profiles + clinic_members)
--
--
-- ════════════════════════════════════════════════════════════════
-- ⚠  O QUE NÃO VEIO — E PRECISA DE ATENÇÃO
-- ════════════════════════════════════════════════════════════════
--
-- 1) ROW LEVEL SECURITY (RLS) — o ponto mais importante
--    O Postgres/Supabase tinha 103 policies de RLS garantindo, no próprio
--    banco, que cada usuário só lê/escreve dados da SUA clínica e que dado
--    clínico sensível (medical_records) só é acessível a admin/médico.
--    MySQL NÃO tem RLS. Nenhuma dessas regras foi (ou poderia ser)
--    traduzida. Consequência prática: qualquer conexão com este banco lê
--    tudo de todas as clínicas.
--    → Toda essa autorização precisa ser reimplementada na aplicação
--      (filtrar clinic_id em cada query, checar papel antes de cada
--      leitura de dado clínico). Enquanto isso não existir, o isolamento
--      multitenant e a proteção LGPD do prontuário não estão garantidos.
--
-- 2) FUNÇÕES E TRIGGERS
--    As 26 funções e 19 triggers do Postgres não foram convertidas.
--    Boa parte era infraestrutura do Supabase (auth.uid(), current_clinic_id(),
--    hook de access token) e não tem sentido em MySQL. As demais eram regras
--    de negócio no banco — por exemplo o controle que impede venda de estoque
--    acima do saldo (0045_estoque_rejeita_oversell) e os gatilhos de
--    updated_at. Precisam ser reescritas como trigger MySQL ou movidas para
--    a aplicação.
--
-- 3) ÍNDICES PARCIAIS (UNIQUE com WHERE)
--    MySQL não suporta. Foram convertidos em índices comuns, o que mantém a
--    performance mas PERDE a garantia de unicidade condicional:
${avisos.filter((a) => a.startsWith("UNIQUE PARCIAL"))
  .map((a) => `--      · ${a.replace(/^UNIQUE PARCIAL perdeu a condição /, "").replace(/ → virou índice não-único: /, "  →  ").replace(/\. Garanta a regra na aplicação\.$/, "")}`)
  .join("\n")}
--    → Precisam ser validados na aplicação (ex.: não deixar cadastrar dois
--      pacientes com o mesmo CPF na mesma clínica).
--
-- 4) FUSO HORÁRIO
--    timestamptz virou DATETIME(6), que não guarda timezone. Grave sempre
--    em UTC e converta na exibição, senão os horários de agenda/atendimento
--    vão divergir.
--
-- 5) UM DEFAULT SEM EQUIVALENTE
--    medical_records_scanned.tenant_id tinha DEFAULT auth.uid() — o ID do
--    usuário logado, resolvido pelo Supabase Auth. Em MySQL a coluna ficou
--    sem default: a aplicação precisa preencher tenant_id explicitamente no
--    INSERT. (Todos os outros 300+ defaults foram convertidos.)
--
-- 6) STORAGE
--    Anexos (prontuário digitalizado, logo da clínica, arquivos de anamnese)
--    ficavam no Storage do Supabase. As colunas de caminho continuam aqui,
--    mas os arquivos e as FKs para storage.objects não — é preciso outro
--    destino para os arquivos.
--
-- 7) A APLICAÇÃO NÃO RODA SOBRE ESTE BANCO COMO ESTÁ
--    O código em src/lib/supabase/ fala com o Supabase via PostgREST
--    (supabase-js). Nada disso funciona apontando para MySQL. Este arquivo
--    entrega o BANCO convertido; trocar a camada de acesso a dados e a
--    autenticação da aplicação é um trabalho separado e bem maior.
-- ════════════════════════════════════════════════════════════════
`;

const final = schema + admin + seeds + notas;
writeFileSync("/tmp/pgtest/agicare_mysql.sql", final);

const linhas = final.split("\n").length;
const kb = Math.round(Buffer.byteLength(final) / 1024);
console.log(`agicare_mysql.sql — ${linhas} linhas, ${kb} KB`);
console.log(`Senha admin: ${SENHA}`);
console.log(`bcrypt verifica: ${bcrypt.compareSync(SENHA, HASH)}`);

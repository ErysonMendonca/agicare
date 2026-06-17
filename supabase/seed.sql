-- ════════════════════════════════════════════════════════════════
-- agicare — seed de exemplo (dados fictícios para desenvolvimento)
-- ⚠️ Crie os usuários via Supabase Auth (Dashboard ou signUp) ANTES,
--    e use os UUIDs reais de auth.users para popular profiles/role.
--    Os INSERTs abaixo são ilustrativos — ajuste os UUIDs.
-- ════════════════════════════════════════════════════════════════

-- Exemplo: após criar um usuário no Auth, promova o papel:
-- update public.profiles set role = 'admin',   full_name = 'Admin Clínica'   where id = '<uuid-auth>';
-- update public.profiles set role = 'medico',   full_name = 'Dra. Marina'     where id = '<uuid-auth>';
-- update public.profiles set role = 'recepcao', full_name = 'Recepção'        where id = '<uuid-auth>';

-- Pacientes de exemplo (não dependem de Auth):
-- insert into public.patients (full_name, birth_date, cpf, phone)
-- values ('João da Silva', '1985-03-12', '000.000.000-00', '(11) 90000-0000');

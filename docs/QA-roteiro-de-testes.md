# agicare — Roteiro de Testes de QA (end-to-end)

Roteiro para o QA validar **todo o sistema seguindo o fluxo real de funcionamento**: do login da recepção, passando pelo totem/fila, agenda, atendimento médico (prontuário completo), enfermagem, e os módulos de gestão (procedimentos, estoque, faturamento, laboratório, profissionais, relatórios/LGPD, configurações).

> Leia primeiro as seções **1 (Pré-requisitos)** e **2 (Papéis)**. Depois execute as suítes **na ordem** (S0 → S16): elas seguem o caminho que um paciente percorre na clínica. A seção **17 (Gaps conhecidos)** lista o que ainda é tela/placeholder — **não abra defeito** para esses itens.

---

## 1. Pré-requisitos e ambiente

### 1.1 Subir o app
```
npm install
npm run dev        # http://localhost:3000
```
Para validar build de produção: `npm run build` (deve terminar sem erros) e `npm run lint` (0 erros).

### 1.2 Dois modos de execução — saiba em qual você está
- **Modo DEMO** (sem chaves Supabase no `.env.local`): o login leva direto ao dashboard e todas as telas usam **dados fictícios (mock)**. Útil para testar UI/fluxo visual, **mas nada persiste** (criar/editar não grava).
- **Modo REAL** (chaves Supabase configuradas em `.env.local`): autenticação real + dados no banco. **Necessário para testar persistência** (cadastros, status da fila, prontuário, etc.).

> Confirme com o time qual modo está ativo antes de começar. Casos marcados **[PERSIST]** só fazem sentido no modo REAL.

### 1.3 Banco de dados (modo REAL) — OBRIGATÓRIO antes de testar persistência
1. No **SQL Editor do Supabase**, aplicar o consolidado **`docs/APPLY-MIGRATIONS-pendentes.sql`** (migrations 0004→0018). Sem isso, os módulos clínicos/enfermagem/agenda/estoque/faturamento/totem/LGPD **não persistem**.
2. Esse script cria também o **bucket de Storage `protetico`** (necessário para o upload do fluxo protético).
3. Rodar a seed de dados demo: `npm run seed` (cria usuários e dados de exemplo).
4. Verificação rápida do schema aplicado: `node scripts/schema-check.mjs` → deve reportar "✅ Tudo aplicado".

### 1.4 Critério de aprovação por caso
Cada caso tem **Resultado esperado**. Marque: ✅ Passou · ❌ Falhou · ⚠️ Passou com ressalva · ⛔ Bloqueado. Para ❌/⚠️, registre defeito (template na seção 18).

---

## 2. Papéis e credenciais (modo REAL)

Senha padrão da seed para todos: **`Agicare2026!`** (única para todas as contas). As contas só existem **após rodar `npm run seed`** (modo REAL).

| Papel | Login | Senha | O que enxerga |
|-------|-------|-------|---------------|
| **Gestor (admin)** | `admin@agicare.test` | `Agicare2026!` | Tudo, **incluindo financeiro** (receita, margem, valores) e Procedimentos/Lab financeiro |
| **Médico** | `medico@agicare.test` | `Agicare2026!` | Clínico (prontuário, prescrição, anamnese da sua especialidade); **sem financeiro** |
| **Médico 2** | `medico2@agicare.test` | `Agicare2026!` | Outra especialidade (para testar filtro por especialidade) |
| **Recepção** | `recepcao@agicare.test` | `Agicare2026!` | Operacional (fila, agenda, pacientes); **sem financeiro**, **sem Procedimentos** |
| **Paciente** | ⚠️ *não há conta de paciente na seed* | — | Não vê dados clínicos da clínica (RLS) |

> ⚠️ **Paciente sem credencial:** a seed (`scripts/seed.mjs`) cria apenas as 4 contas acima. Não existe usuário com `role=paciente`, então os casos que exigem login de paciente ficam **bloqueados** até criar essa conta manualmente (ou adicionar um paciente ao seed).

> Regra central a validar em todo o sistema: **informação financeira é restrita ao gestor**. Itens marcados **[GESTOR]** devem aparecer para admin e ficar **ocultos/"Restrito"** para médico/recepção.

---

## 3. Convenções

- **Papel:** quem deve estar logado para o caso.
- **[PERSIST]** depende de banco real; **[GESTOR]** valida restrição financeira; **[LGPD]** valida proteção de dados sensíveis.
- Sempre que um caso disser "recarregue", aperte F5 para confirmar que a mudança **persistiu** (não era só estado da tela).

---

## S0 — Smoke test / ambiente

| # | Passos | Resultado esperado |
|---|--------|--------------------|
| 0.1 | Abrir `http://localhost:3000` | Tela de login carrega sem erro de console |
| 0.2 | Navegar por todas as rotas do menu lateral logado | Nenhuma rota dá 404/500; cada tela renderiza |
| 0.3 | (Build) rodar `npm run build` | Termina sem erro de tipo/compilação |

---

## S1 — Autenticação e acesso por papel

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 1.1 | — | Na tela de login, conferir campos: usuário, senha, **dropdown Clínica**, botão Entrar, link "Acesso Administrativo" no rodapé | Todos presentes |
| 1.2 | — | Clicar no ícone de olho no campo senha | Alterna ocultar/exibir a senha |
| 1.3 | — | Entrar com credencial inválida | Mensagem de erro amigável; não loga |
| 1.4 | Recepção | Login com `recepcao@agicare.test` | Vai ao Dashboard; topbar mostra nome/perfil do usuário |
| 1.5 | — | Acessar `/dashboard` sem estar logado (aba anônima) | Redireciona para o login |
| 1.6 | — | Abrir o link "Acesso Administrativo" (`/admin/login`) | Tela de login administrativo distinta |
| 1.7 | Qualquer | Logout pela sidebar | Volta ao login; sessão encerrada (F5 não re-entra) |

---

## S2 — Dashboard

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 2.1 | Admin | Abrir Dashboard | 4 KPIs: Pacientes Ativos (com variação %), Consultas Hoje, **Receita Mensal**, Taxa de Ocupação |
| 2.2 | Admin | Observar gráficos | Linha "Consultas vs Retornos" (6 meses) + barras de Receita; tooltip ao passar o mouse |
| 2.3 | Admin | Central de Alertas | 3 níveis com cores: vermelho (estoque baixo), laranja (faturas — só gestor), azul (confirmações) |
| 2.4 | **[GESTOR]** Recepção/Médico | Abrir Dashboard logado como não-gestor | Card **Receita Mensal** e gráfico de Receita aparecem como **"Restrito"/cadeado**; alerta laranja de faturas **não** aparece |
| 2.5 | Qualquer | KPIs numéricos | Animam (count-up) ao carregar |
| 2.6 | Qualquer | "Próximas Consultas" | Lista com paciente, especialidade, horário e status colorido |

---

## S3 — Fluxo Totem / Fila de Atendimento  *(início do fluxo do paciente)*

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 3.1 | Recepção | Abrir **Fila** | Painel com 4 indicadores **coloridos** (Aguardando, Chamados, Em Atendimento, Total) |
| 3.2 | Recepção | Seção **"Agendados — aguardando chegada"** | Lista os pacientes **agendados de hoje** (vindos da Agenda) que ainda não fizeram check-in |
| 3.3 | **[PERSIST]** Recepção | Em um agendado, clicar **"Check-in / Emitir Senha"**, escolher prioridade (Normal/Preferencial/Urgente), confirmar | Modal mostra a **SENHA gerada** em destaque (ex.: A001, ou **P001** se preferencial); o paciente sai dos "agendados" e entra na fila ativa |
| 3.4 | Recepção | Na tela da senha, clicar **"Imprimir Ficha"** | Abre a impressão exibindo **só a ficha** (paciente, senha, especialidade, médico, data/hora) |
| 3.5 | Recepção | Clicar num card da fila → **Chamar** | Toca um **beep**; status do paciente muda para "Chamado" (recarregue: persiste — [PERSIST]) |
| 3.6 | Recepção | No mesmo card → **Atender** | Abre o modal "Dados de Atendimento" (convênio, responsável, etc.); status vira "Em Atendimento" |
| 3.7 | Recepção | No modal de atendimento, **Salvar e Imprimir** | Salva (valida convênio/plano) e dispara impressão da guia |
| 3.8 | Recepção | Em um card → **Desistência** | Exige **motivo** (campo obrigatório) antes de confirmar; status vira "Desistência" |
| 3.9 | Recepção | Usar a **busca** (nome ou nº de senha) e o **filtro de status** | A lista filtra de fato (não é decorativa); "Todos" limpa |
| 3.10 | Recepção | Clicar "Atender" em **um** paciente | **Somente aquele** muda de status (não afeta os demais) |

---

## S4 — Agenda  *(agendar e manter horários)*

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 4.1 | Recepção | Abrir **Agenda** | KPIs no topo (Total, Agendados, Confirmados, Em Atendimento, Finalizados); empty state ilustrado quando vazio |
| 4.2 | **[PERSIST]** Recepção | **Novo Agendamento** → passo a passo: paciente (busca), especialidade, profissional, tipo, data | Avança pelos passos; valida campos obrigatórios |
| 4.3 | Recepção | Passo de **seleção de horário** | Grade visual com **verde = disponível** e **cinza = ocupado** (não dá para escolher ocupado) |
| 4.4 | Recepção | Confirmar agendamento | Mostra resumo + orientações e gera **número de Protocolo** no comprovante |
| 4.5 | Recepção | **Configuração de Escala** → aba Dados Principais + aba Horários | Definir profissional/especialidade, tempo de atendimento; **Gerar Grade Automática** cria horários |
| 4.6 | Recepção | Na escala, **bloquear/desbloquear** um horário | O horário alterna entre disponível e bloqueado |
| 4.7 | **[PERSIST]** Recepção | Manutenção: **remarcar**, **cancelar**, **trocar profissional/especialidade** de um agendamento | A alteração persiste (recarregue) |
| 4.8 | Recepção | Após agendar, voltar à **Fila** | O novo paciente agendado aparece na seção "Agendados" (validação do vínculo Agenda↔Fila) |

---

## S5 — Pacientes

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 5.1 | Recepção | Abrir **Pacientes** | Cards: total, ativos, com alergias, em tratamento; tabela com nome/CPF, contato, convênio, tipo sanguíneo, ícones de alerta, status |
| 5.2 | **[PERSIST]** Recepção | **Novo cadastro** → aba Dados Pessoais: digitar **CPF inválido** | Validação de dígito verificador acusa erro |
| 5.3 | Recepção | Ativar toggle **"Habilitar nome social"** | Campo Nome Social só então fica editável |
| 5.4 | Recepção | Preencher **CEP** válido | **ViaCEP** preenche logradouro/bairro/cidade/UF automaticamente |
| 5.5 | Recepção | Informar **Convênio e Plano** (não-SUS) | Campos aceitos; validação convênio→plano |
| 5.6 | **[PERSIST]** Recepção | Salvar paciente | Aparece na lista; KPIs atualizam (recarregue) |
| 5.7 | Recepção | Aba **Óbito**: registrar data/causa | Status do paciente muda para **Inativo/Óbito** no sistema |
| 5.8 | Recepção | Busca por nome/CPF/e-mail | (ver seção 17 — filtro pode ser parcial) |

---

## S6 — Prontuário (fluxo clínico do médico)  *(núcleo do atendimento)*

> Logar como **Médico**. O médico deve ver, por **default**, só pacientes da **sua especialidade/nome**; pode buscar outros pela barra superior.

| # | Passos | Resultado esperado |
|---|--------|--------------------|
| 6.1 | Abrir **Prontuário** (lista) | Cards de status coloridos (Todos/Agendados/Aguardando/Realizados); banner "Exibindo: <especialidade do médico>" |
| 6.2 | Default da lista | Mostra apenas pacientes da especialidade do médico logado; busca permite outras |
| 6.3 | Em um paciente para atendimento | Aparece o modal **Chamar / Atender / Visualizar / Evasão** (mesmo da fila) |
| 6.4 | Abrir o **Resumo 360º** de um paciente | Identificação com nome, registro, idade, **nome da mãe**, gênero; selo "Atendimento em andamento"; sinais vitais; timeline de evoluções |
| 6.5 | Botão **"Histórico"** (antes de Resumo) | Exibe o prontuário **manual** anexado no cadastro do paciente |
| 6.6 | Abas do prontuário | Resumo, Evolução, Prescrição, Checagem, Anamnese, **Exames**, **Protético**, Documentos |
| **Anamnese (5.1/5.2)** | | |
| 6.7 | Abrir **Anamnese** | Bloco Histórico Geral (doenças, medicamentos, **alergias em destaque amarelo**, antecedentes, hábitos) + bloco da especialidade (Odonto/Podo com alerta vermelho pré-diabético/Estética) |
| 6.8 | Tentar **gerar** anamnese de **especialidade diferente** da do médico | **Não permite gerar** (só visualizar); aviso na tela |
| 6.9 | **[LGPD]** Consentimentos | Exige **Consentimento para Atendimento** e **LGPD** marcados + assinatura para gerar; "Registro de Imagens" é **opcional**; há **Aviso Legal** |
| 6.10 | **[PERSIST]** Gerar anamnese | Salva e aparece na lista |
| **Evolução (5.3)** | | |
| 6.11 | **[PERSIST]** Nova Evolução | Modal com data/hora (permite retroagir), sinais vitais e campos obrigatórios (Queixa, HDA, Exame, Hipótese, Conduta) |
| 6.12 | Seção **"Outros sinais (opcional)"** | Adicionar par rótulo→valor (ex.: "Perímetro cefálico" / "34 cm") — salva e aparece no card |
| 6.13 | Card de evolução → **Ver** e **Imprimir** | Visualização completa e impressão |
| **Prescrição (5.4)** | | |
| 6.14 | Adicionar **Medicamento** (auto-complete) | A lista **puxa medicamentos do estoque**; ao escolher, a **concentração vem preenchida** do cadastro (só informa posologia/duração/observações) |
| 6.15 | Adicionar **Cuidado** com frequência | — |
| 6.16 | **[PERSIST]** Salvar prescrição → abrir **Checagem** | Medicamento e cuidado com frequência **geram os aprazamentos** na tela de Checagem |
| 6.17 | Editar/Excluir prescrição | Editar reabre preenchido; excluir **bloqueia** se já houver dose administrada |
| **Exames (5.6)** | | |
| 6.18 | **[PERSIST]** Aba **Exames** → novo pedido por **código TUSS** | Select mostra exame + código TUSS + categoria (Laboratorial/Imagem); salvar adiciona à lista com status "Solicitado" |
| 6.19 | Marcar exame como **Concluído** | Status alterna; observação por item é registrada |
| **Protético (5.5)** | | |
| 6.20 | **[PERSIST]** Aba **Protético** → stepper 3 etapas | Etapa 1 (dentes, tipo de trabalho, **Urgente** muda prazo 10→5 dias); Etapa 2 (material/cor/observações); Etapa 3 (anexos) |
| 6.21 | **[PERSIST]** Anexar arquivo (STL/foto/raio-x) e concluir | Upload conclui sem erro; o anexo aparece listado no pedido *(requer bucket `protetico` criado — ver 1.3)* |
| **Documentos (5.7) + Receita** | | |
| 6.22 | Aba **Documentos** → **Atestado** | Dias de afastamento, datas, diagnóstico; **CID-10 opcional** |
| 6.23 | **Alta Médica** | Motivo, diagnóstico, orientações pós-alta |
| 6.24 | Botão **Receita** | Gera/imprime a receita |
| 6.25 | **[LGPD]** Após abrir um prontuário, ver Relatórios → aba LGPD (como admin) | O acesso ao prontuário foi **registrado no log de acessos** (ver S13) |

---

## S7 — Enfermagem (assistencial)

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 7.1 | Médico/Admin | Abrir **Enfermagem** → **Sinais Vitais** | Aferir PA, FC, FR, Tax, SpO2, HGT; cards coloridos com status (Normal etc.) |
| 7.2 | — | Seção **"Outros sinais (opcional)"** | Adicionar item extra (ex.: sinais do bebê) — salva e exibe no card |
| 7.3 | — | **Anotação de Enfermagem** | Texto livre; gera código (ANO-001) + data/hora/profissional automáticos |
| 7.4 | — | **Checagem de Cuidados** → checar item | Modal exige informar **Administrado** ou **Aprazado** e a **justificativa** da não checagem; permite **reaprazar** |
| 7.5 | — | **Balanço Hídrico** | Lança ganhos/perdas; saldo horário e acumulado calculam automaticamente; **fechamento por período** |
| 7.6 | — | **Evolução de Enfermagem** | 3 blocos (avaliação/reavaliação/conduta); histórico com **COREN** |
| 7.7 | — | **Escalas** (Glasgow/Fugulin/Braden) | Selecionar critérios calcula pontuação + classificação automaticamente |
| 7.8 | — | **Procedimentos de Enfermagem** | Busca por **TUSS**; registra materiais/local/observações |
| 7.9 | **[PERSIST]** — | **SAE (NANDA)** → salvar prescrição de enfermagem com frequência | Gera **automaticamente os horários** na tela de Checagem |

---

## S8 — Procedimentos  **[GESTOR]**

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 8.1 | Recepção/Médico | Tentar abrir **Procedimentos** | Acesso **restrito** (tela "Restrito ao gestor"); item some/bloqueado para não-gestor |
| 8.2 | Admin | Abrir Procedimentos | KPIs (total, ativos, **ticket médio, margem média**); tabela com código/nome/categoria/duração/valor/margem/status |
| 8.3 | **[PERSIST]** Admin | **Novo Procedimento** → 6 abas (Identificação, Tempo&Agenda, Materiais, Sessões, Orientações, Financeiro) | SKU gerado automático; aba Financeiro calcula **lucro líquido e margem real** em tempo real |
| 8.4 | **[PERSIST]** Admin | **Editar** um procedimento | Modal reabre preenchido; salvar persiste |
| 8.5 | **[PERSIST]** Admin | **Excluir** um procedimento | Soft-delete: some da lista (recarregue) |

---

## S9 — Estoque

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 9.1 | Recepção/Admin | Abrir **Estoque** (no grupo **Operacional**) | Lista de produtos com saldo/mínimo e status (Crítico/Baixo/Adequado) |
| 9.2 | **[PERSIST]** | **Cadastro de Produto** | Formulário completo (código, categoria, unidade, saldo, mínimo, lote, validade, localização, **custo/preço só p/ gestor**, fornecedor) |
| 9.3 | | **Dispensação** → **Iniciar Separação** | Abre a tela/modal de Separação (localização, lote, validade); barra de progresso; "Urgente" destacado |
| 9.4 | **[PERSIST]** | **Entrada de Produtos** (NF, fornecedor, valor) | Registra a entrada |
| 9.5 | | **Inventário** (geral/parcial) e **Compras** (solicitação→cotação→aprovação) | Fluxos navegáveis (ver gaps na seção 17) |
| 9.6 | **[GESTOR]** Recepção | Conferir custo/preço/valorização | Valores financeiros **não** aparecem para não-gestor |

---

## S10 — Faturamento  *(eventos faturáveis)*

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 10.1 | Admin | Abrir **Faturamento** | Lista de eventos faturáveis; **filtros por status** (Pendente/Faturado/Glosado) e **tipo** (Convênio/Particular) **funcionam** |
| 10.2 | Admin | Abrir **Conferência/Check-out** de um evento | Itens TUSS + materiais; aplicar **desconto/acréscimo** recalcula o total |
| 10.3 | Admin | Aba **TISS** | Guias com status Validada/Alerta/Erro; ação de gerar lote (ver gaps: XML é simulado) |
| 10.4 | **[GESTOR]** Recepção/Médico | Abrir Faturamento como não-gestor | **Valores** (Valor Total/Estimado) ficam ocultos/"Restrito"; contagens seguem visíveis |

---

## S11 — Laboratório

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 11.1 | Recepção/Admin | Abrir **Laboratório** | KPIs (Total/Em Andamento/Pendências/Finalizados/Urgentes) **com cores distintas** |
| 11.2 | | Alternar **Lista ↔ Kanban** | Kanban com colunas Entrada/Processamento/Refinamento/Conclusão |
| 11.3 | **[GESTOR]** Admin | **Financeiro do Laboratório** | Indicadores (Orçado/Aprovado/Faturado/Pago/Total) com cores; **Exportar** gera CSV |
| 11.4 | **[GESTOR]** Recepção | Financeiro do Lab como não-gestor | Restrito/oculto |

---

## S12 — Profissionais

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 12.1 | Admin | Abrir **Profissionais** | KPIs (total, equipe clínica, administrativa, ativos); abas (Clínica/Administrativa/Perfis) |
| 12.2 | Admin | Cabeçalho da **Equipe Clínica** | Botão **"Novo Cadastro"** presente |
| 12.3 | **[PERSIST]** Admin | **Novo Profissional** (clínico) | Formulário com rótulo **"Conselho"** (não "CRM") e seção de **Endereço**; salvar cria o profissional |
| 12.4 | **[PERSIST]** Admin | **Editar** um profissional | Reabre preenchido; salvar persiste |

---

## S13 — Relatórios / BI / LGPD (GRC)

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 13.1 | Admin | Abrir **Relatórios** | KPIs reais (absenteísmo, retenção, novos pacientes); gráficos por mês |
| 13.2 | Admin | Botões **Exportar / Baixar** | Geram **CSV** de verdade (download dispara) |
| 13.3 | **[GESTOR][LGPD]** Médico/Recepção | Abrir Relatórios como não-gestor; inspecionar o **payload** (DevTools → Network/HTML do RSC) | Os campos **financeiros** (receita, ticket, margem, inadimplência) **NÃO** vêm no payload — não basta estar escondido na tela |
| 13.4 | **[LGPD]** Admin | Aba **Conformidade LGPD** → **Log de Acessos a Prontuários** | Lista quem acessou, qual paciente, módulo, data/hora (inclui o acesso feito no caso 6.25) |
| 13.5 | **[LGPD]** Admin | **Log de Consentimentos** + **Exportar Auditoria** | Mostra consentimentos registrados; exporta CSV |
| 13.6 | **[LGPD]** Médico/Recepção | Tentar ver a aba LGPD como não-gestor | Restrita ao gestor |

---

## S14 — Configurações

| # | Papel | Passos | Resultado esperado |
|---|-------|--------|--------------------|
| 14.1 | Admin | Abrir **Configurações** | Dados Institucionais (CNPJ, endereço, horários) e Preferências (idioma, fuso, formatos, moeda) |
| 14.2 | **[PERSIST]** Admin | Editar e salvar dados institucionais/preferências | Persiste (recarregue) |
| 14.3 | **[GESTOR]** Recepção | Tentar salvar configurações como não-gestor | **Bloqueado** (restrito ao gestor) |
| 14.4 | — | Abas de 2FA / Backup / White-label / Notificações | Ver seção 17 (são UI/placeholder — não abrir defeito) |

---

## S15 — Segurança e LGPD (transversal — fazer ao longo dos testes)

| # | Verificação | Resultado esperado |
|---|-------------|--------------------|
| 15.1 | Logado como **paciente**, abrir dashboard/listas | Não vê dados clínicos da clínica (KPIs zerados por RLS) — comportamento esperado |
| 15.2 | Recepção tentar criar **Procedimento** (via UI ou request) | Negado no servidor (não só escondido) |
| 15.3 | Recepção tentar salvar **Configurações** | Negado no servidor |
| 15.4 | Conferir que valores financeiros nunca chegam ao não-gestor (Dashboard, Faturamento, Relatórios, Lab) | Sempre "Restrito"/ausentes no payload |
| 15.5 | Acessos a prontuário ficam registrados (S13.4) | Trilha de auditoria preenchida |

---

## S16 — Não-funcionais

| # | Verificação | Resultado esperado |
|---|-------------|--------------------|
| 16.1 | Responsividade (desktop / tablet / mobile) | Layout não quebra; sidebar adapta |
| 16.2 | Animações (count-up, transições, hover) | Suaves, sem travar |
| 16.3 | Impressão (ficha da fila, receita, evolução, atestado) | Imprime só o conteúdo relevante |
| 16.4 | Acessibilidade básica | Navegação por teclado, foco visível, labels nos campos |
| 16.5 | Console do navegador | Sem erros vermelhos durante o fluxo |

---

## 17. Gaps conhecidos — **NÃO abrir defeito** (são tela/placeholder até nova onda)

Estes itens existem visualmente mas **ainda não têm backend/integração real**. Trate como "fora de escopo do build atual":

- **Notificações reais** (e-mail/SMS/WhatsApp): toggles existem, **não enviam** nada. Inclui SMS/E-mail do comprovante de Agenda e orientações pré/pós de Procedimentos.
- **Agenda → QR Code** no comprovante: placeholder, não gera QR real.
- **Faturamento → XML TISS**: a "geração de lote" apenas marca como enviado; **não produz XML** real. Pagamento **PIX/Cartão/Boleto** e faturamento **Empresa/NF**: UI sem integração.
- **Pacientes → CadSus** (sync) e **validação de CNS** (dígito): ausentes. **Busca/duplicidade de CPF** (lupa): ausente. **Exportar lista** de pacientes: pode estar inativo.
- **Pacientes → anexo de prontuário manual** (upload de arquivo): hoje é campo de texto.
- **Estoque → Inventário e Relatórios/valorização**: abas existem com conteúdo limitado; **upload de PDF de cotação**: ausente; **baixa automática** de materiais ao executar procedimento: não dispara.
- **Profissionais → indicadores de agenda** nos cards (consultas do dia/próxima), filtro das abas, "Ver Agenda"/"Documentos", campo Observações: parciais/placeholder.
- **Relatórios/BI**: "Tempo médio de espera", "Origem dos pacientes" (ROI marketing), BI **epidemiológico** (patologias, alergias×especialidade), conversão de orçamentos, desempenho por convênio: **representativos/ausentes**.
- **Configurações**: **2FA**, política de senha (enforcement), **timeout de sessão**, **backup** (Baixar/Restaurar/Executar) e **White-label** (temas/paleta/upload de logo): UI sem lógica real.
- **Dashboard**: "Próximas Consultas" mostra especialidade (não o nome do médico); badges de Fila/Estoque na sidebar são fixos.
- **Modo DEMO**: qualquer caso **[PERSIST]** não grava — valide persistência só no modo REAL.

> Esses itens estão mapeados como próximas ondas (Tier 2/3). Se algum for priorizado, será movido para o escopo testável.

---

## 18. Template de registro de defeito

```
[ID]        BUG-000
[Suíte/Caso] S6 / 6.16
[Papel]      Médico
[Modo]       REAL / DEMO
[Severidade] Crítica | Alta | Média | Baixa
[Passos para reproduzir]
  1. ...
[Resultado obtido]
  ...
[Resultado esperado]
  ...
[Evidência] (print / vídeo / log de console)
[Ambiente] navegador, SO, commit/branch
```

**Severidade sugerida:** Crítica = bloqueia o fluxo ou vaza dado sensível/financeiro · Alta = funcionalidade central quebrada · Média = comportamento incorreto com contorno · Baixa = visual/cosmético.

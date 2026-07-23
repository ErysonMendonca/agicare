# Plano de pendências — Procedimento (Instrumental) e Estoque (Solicitação/Dispensação)

Baseado na verificação ao vivo (produção pós-PR de impressão) + auditoria de código.
Pontos 1, 2 e 3 (impressão, anamnese por especialidade, exames lab/imagem) estão **OK**.
Este plano cobre o que falta: **ponto 4** (instrumental no procedimento) e **ponto 5**
(estoque: Setor Fornecedor na solicitação + ligar solicitação à dispensação).

> Convenção de trabalho: cada item vira uma branch/PR isolada → preview no Vercel →
> QA no preview → merge. Migrações de banco são versionadas em `supabase/migrations/`.

---

## Estado atual (confirmado no código)

- `product_requests` (migration 0069): tem `setor` (solicitante: Farmácia/Recepção/Médico),
  `status`, `urgent`, `notes`, `requested_by`, `attended_by/at`. **Não há coluna de setor fornecedor.**
- `atenderSolicitacao` (`src/lib/actions/product-requests.ts`): apenas muda `status` para
  `atendida` + `attended_by/at`. **Não cria dispensação nem debita saldo.**
- Dispensação existe (`dispensations`/`dispensation_items`, 0006) com baixa de saldo e
  trava anti-oversell (0045); `dispensation_items` liga a `prescription_item_id` (0043),
  **mas não há vínculo a `product_requests`.**
- `instrumental` não aparece em `src/` nem nas migrations — inexistente. O registro de
  procedimento tem só o campo **"Materiais"** (consumíveis, 0031).

---

## Item 4 — Aba "Instrumental" no procedimento

**Objetivo:** permitir informar o instrumental (instrumentos/kit reutilizável) usado no
procedimento, separado de "Materiais" (consumíveis com baixa de estoque).

**Decisões pendentes (gestor):**
1. Instrumental é **texto/lista livre** ou **catálogo cadastrado** (selecionável)?
2. Precisa de **rastreio de esterilização/CME** (nº do kit, ciclo)? (recomendo deixar p/ fase 2)

**Proposta — Fase 1 (MVP, baixo risco):**
- **DB:** migration nova — coluna `instruments jsonb` (lista de itens) ou tabela
  `procedure_instruments` vinculada ao procedimento executado. Aditiva/idempotente.
- **Backend:** incluir `instrumental` no schema/action de registrar procedimento e na leitura
  (`src/lib/data/atendimento.ts` / `procedimento-doc.ts`).
- **UI:** nova **aba/seção "Instrumental"** no registro de procedimento
  (`AtendimentoAtivoCard` no prontuário e/ou `enfermagem/ProcedimentosTab.tsx`), com
  seleção do catálogo (se decidido) + observação.
- **Impressão:** incluir o instrumental no documento de procedimento (já existe
  `ProcedimentosImpressao.ts`).

**Fase 2 (opcional):** catálogo de instrumentais no módulo gestor + rastreio CME.

**Esforço:** médio · **Risco:** baixo (aditivo, não mexe em saldo).

---

## Item 5A — "Setor Fornecedor" na solicitação (novo requisito)

**Objetivo:** ao solicitar, informar de **qual setor fornecedor** o pedido sai — ex.:
**Farmácia Satélite, Farmácia Principal, Almoxarifado**.

**Proposta — Fase 1:**
- **DB:** migration — `add column supplier_sector text` (ou enum) em `product_requests`.
- **Shared:** em `product-requests.shared.ts`, `SETORES_FORNECEDOR = ['Farmácia Satélite',
  'Farmácia Principal', 'Almoxarifado']` (ou tornar configurável no gestor — fase 2).
- **Backend:** `criarSchema` + insert incluem `supplier_sector` (obrigatório); expor na leitura.
- **UI:** no modal "Nova Solicitação de Produtos", adicionar **select "Setor Fornecedor"**
  (ao lado de "Setor solicitante"); exibir no card e nos filtros da listagem.

**Decisão pendente (importante):** cada setor fornecedor tem **estoque próprio**
(multi-almoxarifado)?
- **Fase 1 (agora):** `supplier_sector` é só um **rótulo** do pedido — estoque continua único.
- **Fase 2 (maior):** saldo por local/almoxarifado; a baixa (item 5B) sai do estoque do
  setor fornecedor escolhido. Requer repensar `stock` por localização.

**Esforço (fase 1):** baixo-médio · **Risco:** baixo.

---

## Item 5B — Ligar Solicitação → Dispensação (com baixa)

**Objetivo:** ao atender uma solicitação, gerar a dispensação e **dar baixa** no estoque,
sem o operador recriar tudo manualmente.

**Opção A — automática (RPC transacional) [recomendada a médio prazo]:**
- **DB:** `add column request_id` em `dispensations` (vínculo). Criar função Postgres
  `atender_solicitacao(request_id)` que, numa transação: valida saldo de todos os itens →
  cria `dispensation` + `dispensation_items` → debita saldo (respeitando a trava
  anti-oversell 0045) → marca a solicitação como `atendida`. Tudo-ou-nada.
- **Backend:** `atenderSolicitacao` passa a chamar a RPC; trata "saldo insuficiente".
- **UI:** botão vira "Atender e dispensar"; erro de saldo mantém `pendente`.

**Opção B — modal pré-preenchido [recomendada p/ MVP/demo]:**
- Botão "Atender" abre a **Nova Dispensação já preenchida** com os itens da solicitação;
  o operador confirma → baixa pela dispensação existente (que já tem anti-oversell).
- **DB:** só o vínculo `request_id` (rastreabilidade). Menos risco, reaproveita o fluxo atual.

**Recomendação:** começar pela **Opção B** (menor risco, entrega o vínculo e a baixa real
sem reescrever a dispensação), evoluir para **A** se quiserem 1 clique.

**Esforço:** médio-alto · **Risco:** alto (mexe em saldo — exige atomicidade e testes).

---

## Sequenciamento sugerido

1. **5A — Setor Fornecedor** (rápido, alto valor visual p/ demo).
2. **4 — Instrumental (fase 1)** (aditivo, isolado).
3. **5B — vínculo Solicitação→Dispensação (Opção B)**.
4. *(Fase 2, se priorizado)* multi-almoxarifado (estoque por setor) e catálogo de instrumentais.

## A confirmar como admin/gestor antes de codar

- **Item 4:** confirmar que o **catálogo de Procedimentos** (módulo gestor) realmente não
  tem campo de instrumental (a evidência de código diz que não).
- **Item 5B:** abrir a tela de **Dispensação** no módulo Estoque (gestor) para desenhar o
  vínculo/pré-preenchimento com fidelidade ao fluxo atual.

## Decisões que preciso de você

1. Instrumental: **texto livre** ou **catálogo**? Rastreio CME agora ou depois?
2. Setor Fornecedor: lista **fixa** (Satélite/Principal/Almoxarifado) ou **configurável**?
   Estoque **próprio por setor** já nesta fase, ou só rótulo por enquanto?
3. Dispensação: **automática ao atender** (Opção A) ou **modal com confirmação** (Opção B)?

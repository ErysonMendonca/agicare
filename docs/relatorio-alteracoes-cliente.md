# AGIcare — Relatório de Alterações

Resumo das melhorias e correções realizadas, separadas entre **já publicadas em
produção** e **concluídas, aguardando publicação**. Data: 23/07/2026.

---

## 1. Já em produção (publicado)

### Impressão dos documentos do atendimento (conformidade)
Ajustes nos documentos que saem impressos, para deixá-los corretos e completos:

- **CRM/CRO do profissional** passou a ser impresso no rodapé de todos os
  documentos (receituário, receita, atestado, alta, evolução, anamnese, pedido de
  exames). Antes saía um texto fixo genérico, sem o registro do conselho.
- **Receituário Simples**: deixou de exibir um nome fixo ("Assinatura do médico") e
  passa a mostrar o profissional real.
- **Receituário de Controle Especial** (Portaria 344/98): passou a identificar o
  **emitente** (nome + conselho) e a exibir a **validade de 30 dias** nas duas vias.
- **Atestado**: correção do número de dias por extenso — agora imprime, por exemplo,
  "5 (cinco) dias" (antes saía "5 (5) dias").
- **CPF do paciente** incluído na identificação de atestado, alta, receita e
  receituário simples.

> Situação: **testado e publicado**. Sem impacto em dados existentes.

---

## 2. Concluído e testado — aguardando publicação

As funcionalidades abaixo já foram implementadas e **testadas no ambiente de teste**.
Faltam apenas a publicação do código e a execução de 3 atualizações de banco (ver
seção 3).

### 2.1. Procedimento — aba "Instrumental"
- Novo **catálogo de instrumentais** gerenciável em Configurações (cadastrar, editar,
  ativar/inativar) — itens reutilizáveis, ex.: Kit cirúrgico básico, Pinça anatômica.
- Nova **etapa "Instrumental"** no cadastro do procedimento, permitindo selecionar do
  catálogo os instrumentais utilizados. Diferente de "Materiais", o instrumental **não
  dá baixa de estoque** (é reutilizável).

### 2.2. Solicitação de produtos — Setor Fornecedor
- Ao criar uma solicitação, agora é obrigatório informar o **Setor Fornecedor** de
  onde o pedido sai (ex.: Farmácia Satélite, Farmácia Principal, Almoxarifado).
- A lista de setores fornecedores é **configurável** em Configurações.
- O setor fornecedor aparece no card de cada solicitação.

### 2.3. Solicitação → Dispensação com baixa (atender e dispensar)
- Antes, "atender" uma solicitação apenas mudava o status — **não movimentava o
  estoque**. Agora, no Estoque, a solicitação ganha o botão **"Atender e dispensar"**.
- Ao clicar, abre uma dispensação **já preenchida** com os itens/quantidades do pedido;
  o operador **confirma** e o sistema **dá a baixa no estoque** automaticamente (com
  trava de saldo — não deixa dispensar mais do que existe) e marca a solicitação como
  atendida, registrando o vínculo entre pedido e dispensação.

### 2.4. Campo de busca de produto (usabilidade)
- Nos formulários de **Nova Solicitação**, **Nova Dispensação (por setor)** e **Atender
  e dispensar**, o antigo menu suspenso de produto virou um **campo de busca** (digita e
  filtra). Resolve a dificuldade de localizar itens quando o catálogo tem centenas de
  produtos.

### 2.5. Tela de Solicitações — foco no que importa
- A tela de Solicitações passou a mostrar **apenas os pedidos do próprio setor** do
  usuário (não expõe mais os pedidos de todos os setores).
- E exibe **apenas os pedidos do dia**, evitando uma lista gigante.
- Observação: a área do **Estoque** que atende os pedidos continua enxergando **todos os
  setores e datas**, para não perder pedidos pendentes a atender.

> Situação: **testado no ambiente de teste**. Depende da publicação + atualizações de
> banco abaixo.

---

## 3. Passos para publicar (técnico)

Para levar a seção 2 ao ar, além de publicar o código, é necessário aplicar **3
atualizações no banco de dados** (já validadas no ambiente de teste):

- `0116` — campo de Setor Fornecedor na solicitação + catálogo inicial.
- `0117` — estrutura do Instrumental no procedimento + catálogo inicial.
- `0118` — vínculo entre solicitação e dispensação.

Todas são **aditivas** (não alteram nem removem dados existentes).

---

## 4. Verificação por especialidade / módulo (já conferido)

Além das entregas acima, foram **verificados e confirmados funcionando**:

- **Anamnese por especialidade**: os modelos ficam na base e são liberados por
  especialidade — o profissional visualiza, mas só gera o modelo da própria especialidade.
- **Solicitação de exames**: laboratorial e de imagem funcionando (categoria automática,
  lateralidade para imagem).
- **Impressão do atendimento**: conforme seção 1.

---

### Resumo executivo

| Entrega | Situação |
|--------|----------|
| Impressão (CRM/CRO, CPF, emitente, validade, atestado) | ✅ Em produção |
| Instrumental no procedimento | 🟡 Pronto — aguardando publicação |
| Setor Fornecedor na solicitação | 🟡 Pronto — aguardando publicação |
| Atender → dispensar com baixa | 🟡 Pronto — aguardando publicação |
| Busca de produto nos formulários | 🟡 Pronto — aguardando publicação |
| Solicitações por setor e do dia | 🟡 Pronto — aguardando publicação |
| Anamnese por especialidade | ✅ Verificado |
| Solicitação de exames (lab/imagem) | ✅ Verificado |

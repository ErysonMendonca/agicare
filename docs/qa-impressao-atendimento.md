# QA — Impressão do Atendimento (CRM/CRO, CPF, prescritor, validade)

Roteiro de teste manual para validar a atualização dos documentos de impressão.
Percorra na ordem. Marque `[x]` no que passar; anote o que falhar.

> **Escopo da mudança:** todos os documentos passaram a imprimir o **registro do
> conselho (CRM/CRO)** do profissional; Receituário Simples deixou de usar nome
> fixo; Receituário de Controle Especial ganhou bloco **Emitente** e **validade
> de 30 dias**; Atestado passou a grafar os dias **por extenso**; Atestado, Alta,
> Receita e Receituário Simples passaram a exibir o **CPF** do paciente.

---

## 0. Pré-condições (setup dos dados)

Sem esses dados, o teste dá "falso negativo" (campos aparecem como "—").

- [ ] **Profissional COM conselho completo.** Em `Profissionais`, edite (ou crie) o
      médico de teste e preencha **Número de conselho**, **UF do conselho** e o
      tipo/nome do conselho (ex.: CRM / SP / 123456). Salve.
- [ ] **Um segundo profissional SEM conselho** (deixe os campos de conselho vazios)
      — para o caso negativo do passo 9.
- [ ] **Paciente COM CPF** cadastrado (em `Pacientes` → cadastro, campo CPF preenchido).
- [ ] **Um paciente SEM CPF** — para o caso negativo do passo 9.
- [ ] **Clínica configurada** (Configurações): nome, CNPJ, endereço, telefone — para
      conferir o cabeçalho.
- [ ] Faça **login como o médico com conselho** e abra um atendimento/prontuário
      do paciente com CPF.
- [ ] Permita **pop-ups** no navegador (a impressão abre em nova janela).

> Dica: em vez de imprimir no papel, use a **pré-visualização de impressão** do
> navegador (Ctrl/Cmd+P na janela que abrir) e confira o rodapé e a identificação.

---

## 1. Receituário Simples

Prontuário → **Receituário** (`/prontuario/{paciente}/receituario`), aba/segmento **Simples**.

- [ ] Digite uma prescrição livre e clique em **Imprimir**.
- [ ] **Rodapé:** aparece o **nome do médico logado** (NÃO "Assinatura do médico").
- [ ] **Rodapé:** logo abaixo do nome, "Assinatura e carimbo — **CRM-SP 123456**"
      (o conselho real, NÃO o texto fixo "Assinatura e carimbo (CRM)").
- [ ] **Identificação:** linha com **CPF** do paciente preenchido.
- [ ] Cabeçalho traz nome/CNPJ/endereço da clínica.
- [ ] Salve o receituário, reabra pela lista e use **Imprimir** no item salvo →
      mesmo resultado.

## 2. Receituário de Controle Especial

Mesma tela, segmento **Especial**.

- [ ] Digite a prescrição e **Imprimir**. Documento sai em **2 vias** (Farmácia / Paciente).
- [ ] Em **cada via**, abaixo da data, há a linha **"Emitente: {nome} — {CRM-SP 123456}"**.
- [ ] Na linha da data aparece **"Validade: 30 dias a contar da emissão"**.
- [ ] Blocos "Identificação do Comprador / Fornecedor" continuam presentes.
- [ ] A quebra de página entre a 1ª e a 2ª via foi mantida.

## 3. Receita (a partir da prescrição)

Prontuário → **Prescrição** → gerar/abrir **Receita** (`/prontuario/{paciente}/receita`).

- [ ] A **pré-visualização em tela** mostra o **CPF** do paciente na identificação.
- [ ] O bloco de assinatura em tela mostra "Assinatura e carimbo — **{conselho do autor}**".
- [ ] Clique **Imprimir receita**: no documento, rodapé com **nome + conselho do
      profissional que fez a prescrição** e identificação com **CPF**.
- [ ] Se houver prescrições de médicos diferentes, o conselho impresso é o do
      **autor da prescrição** (não necessariamente o usuário logado).

## 4. Atestado Médico

Prontuário → **Documentos** (`/prontuario/{paciente}/documentos`).

- [ ] Emita um atestado com **5 dias** e imprima.
- [ ] No corpo: **"5 (cinco) dias"** — por extenso correto (NÃO "5 (5) dias").
- [ ] Teste também **1 dia** → "1 (um) dia" (singular) e **21 dias** → "21 (vinte e um) dias".
- [ ] **Identificação:** CPF preenchido.
- [ ] **Rodapé:** nome + "Assinatura e carimbo — **{conselho do autor}**".

## 5. Alta Médica

Mesma tela **Documentos**.

- [ ] Emita uma alta e imprima.
- [ ] **Identificação:** CPF preenchido.
- [ ] **Rodapé:** nome + conselho do autor.

## 6. Evolução

Prontuário → **Evolução** (`/prontuario/{paciente}/evolucao`).

- [ ] Registre uma evolução, use **Imprimir** no card.
- [ ] **Rodapé:** nome + "Assinatura e carimbo — **{conselho do autor}**"
      (NÃO o texto fixo "(CRM)").

## 7. Anamnese

Prontuário → **Anamnese** (`/prontuario/{paciente}/anamnese`).

- [ ] Gere/registre uma anamnese e **Imprimir**.
- [ ] **Rodapé:** nome + conselho do autor.

## 8. Pedido de Exames (lab e imagem)

Prontuário → **Pedidos de Exames** (`/prontuario/{paciente}/exames`).

- [ ] Solicite um exame **laboratorial** e um de **imagem**.
- [ ] Use **Imprimir** no pedido.
- [ ] **Rodapé:** nome do **médico logado** + "Assinatura e carimbo — **{seu conselho}**".

---

## 9. Casos negativos / borda (importante)

- [ ] **Profissional sem conselho:** faça login como o médico sem conselho, imprima
      qualquer documento acima → rodapé mostra apenas **"Assinatura e carimbo"**
      (sem o " — CRM..."), e o sistema **não quebra** nem mostra "—" solto.
- [ ] **Paciente sem CPF:** imprima Atestado/Receita/Receituário → o campo CPF
      aparece como **"—"** (não some, não gera erro).
- [ ] **Reimpressão de documento antigo** (autor diferente do logado): em Atestado,
      Alta, Receita, Evolução e Anamnese o conselho impresso deve ser o do **autor
      original** (vem do banco), não o do usuário que está reimprimindo.
- [ ] **Admin/recepção** (sem conselho próprio) reimprimindo documento de médico:
      Atestado/Alta/Receita mostram o conselho do **autor** (correto); Receituário
      e Exames, por serem emitidos "ao vivo", usam o profissional logado — validar
      se o comportamento é o desejado para esses dois.

## 10. Regressão (não deve ter piorado)

- [ ] Cabeçalho da clínica (nome/CNPJ/endereço) continua correto em todos os documentos.
- [ ] Termo de consentimento / assinatura do paciente (onde existe) inalterado.
- [ ] CID-10 continua **opcional** e só aparece quando marcado "Exibir CID".
- [ ] Ortograma e Procedimentos (que já mostravam o conselho antes) seguem iguais.
- [ ] Layout A4 (moldura, assinatura no fim da folha) sem desalinhamento após a
      inclusão do CPF na tabela de identificação.

---

### Registro do teste

| Passo | Status (OK/Falha) | Observação |
|------|-------------------|------------|
| 1. Receituário Simples | | |
| 2. Controle Especial | | |
| 3. Receita | | |
| 4. Atestado | | |
| 5. Alta | | |
| 6. Evolução | | |
| 7. Anamnese | | |
| 8. Exames | | |
| 9. Casos de borda | | |
| 10. Regressão | | |

**Ambiente:** navegador ________ · versão do build ________ · data ________ · testador ________

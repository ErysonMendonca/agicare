import {
  abrirImpressao,
  cabecalhoHTML,
  esc,
  identPacienteHTML,
  limpo,
  montarDocumentoBase,
  rodapeAssinaturaPaciente,
  type CampoIdent,
  type ClinicaImpressao,
} from "@/lib/clinico/documento-impressao";
import type { DadosAtendimentoDoc } from "./FichaAtendimento";

// ════════════════════════════════════════════════════════════════
// Impressão A4 do pacote de documentos do atendimento (recepção), agora
// sobre o MODELO PADRÃO compartilhado (`documento-impressao`):
//   • Página 1 = FICHA DE DETALHE DO ATENDIMENTO (dados administrativos);
//   • 1 página por TERMO de consentimento ATIVO (paciente assina no papel).
// Cada página é uma `.folha` do modelo (cabeçalho + identificação + corpo com
// moldura + assinatura do PACIENTE/Responsável no fim da folha). A primeira
// página monta o documento (via montarDocumentoBase, que traz o <style> base);
// as demais são injetadas como folhas irmãs — reaproveitando o mesmo CSS.
// ════════════════════════════════════════════════════════════════

export type { ClinicaImpressao };

/** Paciente + carimbos do atendimento necessários à identificação da ficha. */
export type PacienteFicha = {
  nome: string;
  /** Data de nascimento já formatada (dd/MM/aaaa). */
  nascimento: string;
  idade: string;
  /** Sexo já rotulado (Masculino/Feminino/Outro). */
  sexo: string;
  nomeMae: string;
  /** Nº do prontuário do paciente. */
  prontuario: string;
  /** Nº do atendimento (attendance_code). */
  atendimento: string;
  /** Senha da fila (ticket_code). */
  senha: string;
  convenio: string;
};

/** Termo de consentimento reduzido ao necessário para a impressão. */
export type TermoImpressao = { title: string; body: string };

/** Quebra de página entre folhas (usado quando há mais de uma página). */
const CSS_MULTIPAGINA = `
  .folha { page-break-after: always; }
  .folha:last-child { page-break-after: auto; }
`;

/** CSS específico do corpo da ficha (seções rótulo/valor dentro da moldura). */
const CSS_FICHA = `
  .sec { margin-bottom: 12px; }
  .sec:last-child { margin-bottom: 0; }
  .sec-tit { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #555; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 6px; }
  .kv { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; padding: 2px 0; border-bottom: 1px dotted #ddd; }
  .kv .k { color: #555; }
  .kv .v { font-weight: 600; text-align: right; }
  .sec-obs { font-size: 12px; text-align: justify; white-space: normal; }
`;

/** Linha rótulo/valor do corpo da ficha; "" quando vazia (não polui). */
function linha(rotulo: string, valor: string): string {
  const v = limpo(valor);
  if (!v) return "";
  return `<div class="kv"><span class="k">${esc(rotulo)}</span><span class="v">${esc(v)}</span></div>`;
}

/** Uma seção (título + linhas); "" quando não há nenhuma linha preenchida. */
function secao(titulo: string, linhas: string[]): string {
  const corpo = linhas.filter(Boolean).join("");
  if (!corpo) return "";
  return `<div class="sec"><div class="sec-tit">${esc(titulo)}</div>${corpo}</div>`;
}

/** Identificação do paciente (layout pedido pelo cliente). */
function identFicha(paciente: PacienteFicha): string {
  const campos: CampoIdent[] = [
    { lbl: "Nome da Mãe", val: paciente.nomeMae, span: 3 },
    { lbl: "Nascimento", val: paciente.nascimento },
    { lbl: "Idade", val: paciente.idade },
    { lbl: "Sexo", val: paciente.sexo },
    { lbl: "Nº Prontuário", val: paciente.prontuario },
  ];
  return identPacienteHTML(paciente.nome, campos);
}

/** Corpo da ficha (dentro da moldura do modelo). */
function corpoFicha(paciente: PacienteFicha, dados: DadosAtendimentoDoc): string {
  const senhaAtend = [limpo(paciente.senha), limpo(paciente.atendimento)]
    .filter(Boolean)
    .join(" / ");

  const dadosAtend = secao("Dados do Atendimento", [
    linha("Senha / Nº Atendimento", senhaAtend),
    linha("Especialidade", dados.especialidade),
    linha("Profissional", dados.profissional),
    linha("Tipo de Atendimento", dados.tipo),
    linha("Caráter", dados.carater),
    linha("Local Procedência", dados.procedencia),
    linha("Centro de Custo", dados.centroCusto),
    linha("Origem", dados.origem),
    linha("Data de Entrada", dados.dataEntrada),
    linha("Gestante", dados.gestante),
  ]);

  const respDoc = secao("Responsável pelo Documento", [
    linha("Nome", dados.abertoPor),
    linha("Função", dados.abertoPorFuncao),
  ]);

  const convenio = secao("Convênio", [
    linha("Convênio", dados.convenio),
    linha("Plano", dados.plano),
    linha("Carteirinha", dados.carteira),
    linha("Validade", dados.validade),
  ]);

  const responsavel = secao("Responsável", [
    linha("Nome", dados.responsavel),
    linha("Documento", dados.respDocumento),
    linha("Grau Parentesco", dados.respParentesco),
  ]);

  const observacao = limpo(dados.observacoes)
    ? `<div class="sec"><div class="sec-tit">Observação</div><div class="sec-obs">${esc(
        dados.observacoes,
      ).replace(/\r?\n/g, "<br>")}</div></div>`
    : "";

  return [dadosAtend, respDoc, convenio, responsavel, observacao]
    .filter(Boolean)
    .join("");
}

/** Folha de um TERMO de consentimento (mesmo modelo da ficha). */
function folhaTermo(
  clinica: ClinicaImpressao,
  paciente: PacienteFicha,
  termo: TermoImpressao,
): string {
  const corpo = esc(termo.body).replace(/\r?\n/g, "<br>");
  return `
  <div class="folha">
    ${cabecalhoHTML(clinica)}
    <div class="titulo">${esc(termo.title)}</div>
    ${identPacienteHTML(paciente.nome, [])}
    <div class="corpo sec-obs">${corpo}</div>
    ${rodapeAssinaturaPaciente()}
  </div>`;
}

/**
 * Monta o documento A4 (uma ou mais folhas). A 1ª folha vem de
 * montarDocumentoBase (traz o <style> do modelo); as demais são injetadas
 * como `.folha` irmãs antes de `</body>`, herdando o mesmo CSS.
 */
function montarDocumento(
  clinica: ClinicaImpressao,
  paciente: PacienteFicha,
  dados: DadosAtendimentoDoc,
  termos: TermoImpressao[],
  incluirFicha = true,
): string {
  const cssExtra = CSS_FICHA + CSS_MULTIPAGINA;

  // Define a PRIMEIRA folha (documento base) e as SEGUINTES (injetadas).
  let base: string;
  let restantes: TermoImpressao[];

  if (incluirFicha) {
    base = montarDocumentoBase({
      titulo: "FICHA DE DETALHE DO ATENDIMENTO",
      clinica,
      pacienteNome: paciente.nome,
      identHTML: identFicha(paciente),
      corpoHTML: corpoFicha(paciente, dados),
      rodapeHTML: rodapeAssinaturaPaciente(),
      cssExtra,
    });
    restantes = termos;
  } else {
    // Impressão seletiva de termo(s), sem a ficha: 1º termo vira o documento base.
    const [primeiro, ...resto] = termos;
    if (!primeiro) {
      // Nada a imprimir — devolve documento base vazio (não deve ocorrer na UI).
      return montarDocumentoBase({
        titulo: "DOCUMENTO",
        clinica,
        pacienteNome: paciente.nome,
        identHTML: identPacienteHTML(paciente.nome, []),
        corpoHTML: "",
        rodapeHTML: rodapeAssinaturaPaciente(),
        cssExtra,
      });
    }
    base = montarDocumentoBase({
      titulo: primeiro.title,
      clinica,
      pacienteNome: paciente.nome,
      identHTML: identPacienteHTML(paciente.nome, []),
      corpoHTML: `<div class="sec-obs">${esc(primeiro.body).replace(/\r?\n/g, "<br>")}</div>`,
      rodapeHTML: rodapeAssinaturaPaciente(),
      cssExtra,
    });
    restantes = resto;
  }

  if (restantes.length === 0) return base;

  const folhas = restantes
    .map((t) => folhaTermo(clinica, paciente, t))
    .join("\n");
  return base.replace("</body>", `${folhas}\n</body>`);
}

/**
 * Abre o pacote de documentos numa janela nova e dispara a impressão.
 * `termos` vazio imprime só a ficha (página 1). Com `incluirFicha = false`
 * imprime apenas os termos informados (impressão seletiva de um único termo).
 */
export function imprimirDocumentosAtendimento(
  clinica: ClinicaImpressao,
  paciente: PacienteFicha,
  dados: DadosAtendimentoDoc,
  termos: TermoImpressao[],
  incluirFicha = true,
): void {
  abrirImpressao(
    montarDocumento(clinica, paciente, dados, termos, incluirFicha),
    "Permita pop-ups para imprimir os documentos do atendimento.",
  );
}

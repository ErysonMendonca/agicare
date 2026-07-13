"use client";

import { useMemo } from "react";
import { Printer, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Prescricao } from "@/lib/clinico/prescricao-shared";
import {
  esc,
  identPacienteHTML,
  limpo,
  montarDocumentoBase,
  rodapeAssinaturaProfissional,
} from "@/lib/clinico/documento-impressao";

type Clinica = {
  nome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
};
type Paciente = {
  nome: string;
  registro: string;
  atendimentoCodigo: string | null;
  idade: string;
  convenio: string;
};

/**
 * Monta o HTML do documento de impressão usando o MODELO padrão compartilhado
 * (`documento-impressao`): cabeçalho + identificação + corpo (medicamentos /
 * cuidados) + assinatura no fim da folha. Abre numa janela nova e imprime só
 * a receita.
 */
function montarDocumento(
  clinica: Clinica,
  paciente: Paciente,
  prescricao: Prescricao,
): string {
  const meds = prescricao.medicamentos
    .map((m, i) => {
      const titulo = [limpo(m.nome), limpo(m.concentracao)].filter(Boolean).join(" ");
      const linha = [limpo(m.via), limpo(m.posologia), limpo(m.frequencia), limpo(m.duracao)]
        .filter(Boolean)
        .join(" · ");
      const obs = limpo(m.observacoes);
      return `
        <li>
          <span class="item-tit">${i + 1}. ${esc(titulo)}</span>
          ${linha ? `<span class="item-sub">${esc(linha)}</span>` : ""}
          ${obs ? `<span class="item-obs">Obs.: ${esc(obs)}</span>` : ""}
        </li>`;
    })
    .join("");

  const cuidados = prescricao.cuidados
    .map((c) => {
      const linha = [limpo(c.frequencia), limpo(c.duracao)].filter(Boolean).join(" · ");
      return `<li><span class="item-tit">${esc(limpo(c.nome))}</span>${
        linha ? `<span class="item-sub">${esc(linha)}</span>` : ""
      }</li>`;
    })
    .join("");

  const obsGerais = limpo(prescricao.observacoes);

  const ident = identPacienteHTML(paciente.nome, [
    { lbl: "Registro", val: limpo(paciente.registro) || "—" },
    { lbl: "Atendimento", val: paciente.atendimentoCodigo ? "#" + paciente.atendimentoCodigo : "—" },
    { lbl: "Idade", val: limpo(paciente.idade) || "—" },
    { lbl: "Convênio", val: limpo(paciente.convenio) || "—" },
    { lbl: "Data", val: limpo(prescricao.dataHora) || "—", span: 3 },
  ]);

  const corpo = `
    ${meds ? `<h2 class="sec">Medicamentos</h2><ul class="itens">${meds}</ul>` : ""}
    ${cuidados ? `<h2 class="sec">Cuidados / Orientações</h2><ul class="itens">${cuidados}</ul>` : ""}
    ${obsGerais ? `<p class="corpo-lbl" style="margin-top:12px"><strong>Observações:</strong> ${esc(obsGerais)}</p>` : ""}`;

  const cssExtra = `
    .corpo { min-height: 300px; }
    .corpo .sec { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 4px 0 8px; }
    .corpo .sec:not(:first-child) { margin-top: 16px; }
    .corpo .itens { list-style: none; padding: 0; margin: 0; }
    .corpo .itens li { padding: 8px 0; border-bottom: 1px dotted #ccc; }
    .corpo .item-tit { display: block; font-weight: bold; font-size: 13px; }
    .corpo .item-sub { display: block; font-size: 12px; color: #555; }
    .corpo .item-obs { display: block; font-size: 11px; color: #666; font-style: italic; }`;

  return montarDocumentoBase({
    titulo: "RECEITUÁRIO",
    clinica,
    pacienteNome: paciente.nome,
    identHTML: ident,
    corpoHTML: corpo,
    rodapeHTML: rodapeAssinaturaProfissional(
      limpo(prescricao.profissional) || "Profissional responsável",
      "Assinatura e carimbo (CRM)",
    ),
    cssExtra,
  });
}

export function ReceitaClient({
  clinica,
  paciente,
  prescricao,
}: {
  clinica: Clinica;
  paciente: Paciente;
  prescricao: Prescricao;
}) {
  const documento = useMemo(
    () => montarDocumento(clinica, paciente, prescricao),
    [clinica, paciente, prescricao],
  );

  /** Abre o documento numa janela nova e dispara a impressão (só a receita). */
  function imprimir() {
    const win = window.open("", "_blank", "width=820,height=1040");
    if (!win) return;
    win.document.write(documento);
    win.document.close();
    win.focus();
    // Pequeno atraso garante a renderização antes do print em alguns browsers.
    setTimeout(() => {
      win.print();
    }, 150);
  }

  return (
    <Card className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Pré-visualização da receita</h2>
          <p className="text-sm text-muted">
            Confira os dados e clique em imprimir para gerar o documento.
          </p>
        </div>
        <Button onClick={imprimir}>
          <Printer className="h-4 w-4" /> Imprimir receita
        </Button>
      </div>

      {/* Pré-visualização A4 (espelha o documento impresso) */}
      <div className="mx-auto max-w-2xl rounded-xl border border-line bg-white p-8 text-ink">
        <div className="border-b-2 border-ink pb-3 text-center">
          <div className="inline-flex items-center gap-2 text-lg font-bold text-ink">
            <Stethoscope className="h-5 w-5 text-brand-600" /> {clinica.nome}
          </div>
          <p className="mt-1 text-xs text-muted">
            {[limpo(clinica.endereco), limpo(clinica.telefone)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {limpo(clinica.cnpj) && (
            <p className="text-xs text-muted">CNPJ: {clinica.cnpj}</p>
          )}
        </div>

        <h1 className="my-4 text-center text-base font-semibold tracking-widest text-ink">
          RECEITUÁRIO
        </h1>

        <div className="mb-5 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted">Paciente:</span>{" "}
            <span className="font-semibold">{paciente.nome}</span>
          </p>
          <p>
            <span className="text-muted">Registro:</span>{" "}
            {limpo(paciente.registro) || "—"}
          </p>
          <p>
            <span className="text-muted">Atendimento:</span>{" "}
            {paciente.atendimentoCodigo ? `#${paciente.atendimentoCodigo}` : "—"}
          </p>
          <p>
            <span className="text-muted">Idade:</span> {limpo(paciente.idade) || "—"}
          </p>
          <p>
            <span className="text-muted">Convênio:</span>{" "}
            {limpo(paciente.convenio) || "—"}
          </p>
          <p>
            <span className="text-muted">Data:</span> {prescricao.dataHora}
          </p>
        </div>

        {prescricao.medicamentos.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Medicamentos
            </h2>
            <ul className="divide-y divide-line">
              {prescricao.medicamentos.map((m, i) => {
                const titulo = [limpo(m.nome), limpo(m.concentracao)]
                  .filter(Boolean)
                  .join(" ");
                const linha = [limpo(m.posologia), limpo(m.frequencia), limpo(m.duracao)]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={m.id} className="py-2">
                    <p className="font-medium text-ink">
                      {i + 1}. {titulo}
                    </p>
                    {linha && <p className="text-xs text-muted">{linha}</p>}
                    {limpo(m.observacoes) && (
                      <p className="text-xs italic text-muted">Obs.: {m.observacoes}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {prescricao.cuidados.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Cuidados / Orientações
            </h2>
            <ul className="divide-y divide-line">
              {prescricao.cuidados.map((c) => {
                const linha = [limpo(c.frequencia), limpo(c.duracao)]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={c.id} className="py-2">
                    <p className="font-medium text-ink">{limpo(c.nome)}</p>
                    {linha && <p className="text-xs text-muted">{linha}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {limpo(prescricao.observacoes) && (
          <p className="mt-3 text-sm text-muted">
            <span className="font-medium text-ink">Observações:</span>{" "}
            {prescricao.observacoes}
          </p>
        )}

        <div className="mt-16 text-center">
          <div className="mx-auto w-72 border-t border-ink pt-1.5 text-sm">
            {limpo(prescricao.profissional) || "Profissional responsável"}
            <p className="text-xs text-muted">Assinatura e carimbo (CRM)</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

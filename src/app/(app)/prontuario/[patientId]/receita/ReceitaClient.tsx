"use client";

import { useMemo } from "react";
import { Printer, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Prescricao } from "@/lib/clinico/prescricao-shared";

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

/** "—" (placeholder do data layer) → vazio, para não poluir a receita. */
const limpo = (v: string) => (v && v !== "—" ? v : "");

/** Escapa texto para inserção segura no documento de impressão. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Monta o HTML do documento de impressão (layout PRÓPRIO, isolado da tela
 * inteira). Estilos inline em escala de cinza (documento gerado, não UI do
 * app) — abre numa janela nova e imprime só a receita.
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

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Receituário — ${esc(paciente.nome)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: black; margin: 32px; line-height: 1.5; }
  .head { text-align: center; border-bottom: 2px solid black; padding-bottom: 12px; margin-bottom: 20px; }
  .clinica { font-size: 18px; font-weight: bold; }
  .clinica-sub { font-size: 12px; color: dimgray; margin-top: 2px; }
  h1 { font-size: 16px; letter-spacing: 2px; text-align: center; margin: 18px 0; }
  .pac { font-size: 13px; margin-bottom: 18px; }
  .pac span { display: inline-block; margin-right: 24px; }
  .label { color: dimgray; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid gainsboro; padding-bottom: 4px; margin: 18px 0 8px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 8px 0; border-bottom: 1px dotted gainsboro; }
  .item-tit { display: block; font-weight: bold; font-size: 14px; }
  .item-sub { display: block; font-size: 12px; color: dimgray; }
  .item-obs { display: block; font-size: 11px; color: gray; font-style: italic; }
  .obs { font-size: 12px; margin-top: 14px; }
  .sign { margin-top: 64px; text-align: center; }
  .sign-line { width: 280px; margin: 0 auto; border-top: 1px solid black; padding-top: 6px; font-size: 13px; }
  .sign-sub { font-size: 11px; color: dimgray; }
  .foot { margin-top: 28px; font-size: 10px; color: gray; text-align: center; }
</style>
</head>
<body>
  <div class="head">
    <div class="clinica">${esc(clinica.nome)}</div>
    <div class="clinica-sub">${esc(
      [limpo(clinica.endereco), limpo(clinica.telefone)].filter(Boolean).join(" · "),
    )}</div>
    <div class="clinica-sub">${
      limpo(clinica.cnpj) ? `CNPJ: ${esc(clinica.cnpj)}` : ""
    }</div>
  </div>

  <h1>RECEITUÁRIO</h1>

  <div class="pac">
    <span><span class="label">Paciente:</span> <strong>${esc(paciente.nome)}</strong></span>
    <span><span class="label">Registro:</span> ${esc(limpo(paciente.registro) || "—")}</span>
    <span><span class="label">Atendimento:</span> ${paciente.atendimentoCodigo ? "#" + esc(paciente.atendimentoCodigo) : "—"}</span>
    <span><span class="label">Idade:</span> ${esc(limpo(paciente.idade) || "—")}</span>
    <span><span class="label">Convênio:</span> ${esc(limpo(paciente.convenio) || "—")}</span>
    <br /><span><span class="label">Data:</span> ${esc(prescricao.dataHora)}</span>
  </div>

  ${meds ? `<h2>Medicamentos</h2><ul>${meds}</ul>` : ""}
  ${cuidados ? `<h2>Cuidados / Orientações</h2><ul>${cuidados}</ul>` : ""}
  ${obsGerais ? `<p class="obs"><strong>Observações:</strong> ${esc(obsGerais)}</p>` : ""}

  <div class="sign">
    <div class="sign-line">
      ${esc(limpo(prescricao.profissional) || "Profissional responsável")}
      <div class="sign-sub">Assinatura e carimbo (CRM)</div>
    </div>
  </div>

  <div class="foot">Documento gerado eletronicamente pelo agicare — ${esc(clinica.nome)}.</div>
</body>
</html>`;
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

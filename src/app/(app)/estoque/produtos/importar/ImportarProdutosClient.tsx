"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Trash2,
  Plus,
  CopyCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import type { ProductCategoryNode } from "@/lib/data/product-categories";
import {
  COLUNAS_MODELO,
  linhaVazia,
  linhaCompleta,
  chaveNome,
  type ProdutoImportRow,
} from "@/lib/estoque/import-produtos-shared";
import { importarProdutosEmMassa } from "@/lib/actions/stock";

/** Teto por importação (espelha o limite da Server Action). */
const MAX_IMPORT = 1000;

/** Quantidade tolerante a decimal com vírgula (pt-BR) e a texto/lixo → 0. */
function parseQuantidade(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : 0;
  let s = String(raw ?? "").trim();
  if (s === "") return 0;
  // Se tem vírgula, é pt-BR: ponto vira separador de milhar, vírgula é decimal.
  // Sem vírgula, mantém como está (ponto = decimal ou inteiro).
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Código de barras SEM notação científica: se o Excel entregou um número
 * (ex.: 7891234567890), converte para inteiro em string em vez de "7.8e12".
 * (Zeros à esquerda já se perdem no próprio Excel — por isso o modelo pede
 * a coluna como texto.)
 */
function codigoBarrasTexto(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Number.isInteger(raw) ? raw.toFixed(0) : String(raw);
  }
  return String(raw ?? "").trim();
}

/** Linha da grade com id estável (React key) e flag de UI — nada disso vai
 *  para o servidor. `manterDup` = importar mesmo sendo duplicado. */
type GridRow = ProdutoImportRow & { _id: string; manterDup?: boolean };

/** Info de duplicidade calculada por linha. */
type DupInfo = { plan: boolean; exist: boolean };

let _seq = 0;
function novaGridRow(base?: ProdutoImportRow): GridRow {
  _seq += 1;
  return { ...(base ?? linhaVazia()), _id: `r${Date.now()}_${_seq}` };
}

/** Rótulos ativos de um nível + valor legado (para não sumir). */
function opcoes(nos: ProductCategoryNode[], valor: string): string[] {
  const ativos = nos.filter((n) => n.active).map((n) => n.label);
  return valor && !ativos.includes(valor) ? [valor, ...ativos] : ativos;
}

export function ImportarProdutosClient({
  categorias,
  nomesExistentes,
}: {
  categorias: ProductCategoryNode[];
  nomesExistentes: string[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Nomes já cadastrados na clínica (normalizados) p/ detectar duplicados.
  const existentesSet = useMemo(
    () => new Set(nomesExistentes.map(chaveNome).filter((k) => k !== "")),
    [nomesExistentes],
  );

  // Duplicidade por linha: `plan` = nome repetido ANTES na própria planilha;
  // `exist` = nome já existe no catálogo da clínica.
  const dupInfo = useMemo(() => {
    const seen = new Set<string>();
    const info: Record<string, DupInfo> = {};
    for (const r of rows) {
      const k = chaveNome(r.descricao);
      const plan = k !== "" && seen.has(k);
      const exist = k !== "" && existentesSet.has(k);
      if (k !== "") seen.add(k);
      info[r._id] = { plan, exist };
    }
    return info;
  }, [rows, existentesSet]);

  const isDup = useCallback(
    (r: GridRow) => {
      const d = dupInfo[r._id];
      return !!d && (d.plan || d.exist);
    },
    [dupInfo],
  );
  // Uma linha ENTRA no salvamento se não for duplicada, ou se o usuário marcou
  // "importar assim mesmo". Duplicadas não-mantidas são ignoradas (não bloqueiam).
  const incluida = useCallback(
    (r: GridRow) => !isDup(r) || !!r.manterDup,
    [isDup],
  );

  const paraSalvar = useMemo(
    () => rows.filter((r) => incluida(r) && linhaCompleta(r)),
    [rows, incluida],
  );
  const incluidasIncompletas = useMemo(
    () => rows.filter((r) => incluida(r) && !linhaCompleta(r)).length,
    [rows, incluida],
  );
  const duplicadosExcluidos = useMemo(
    () => rows.filter((r) => isDup(r) && !r.manterDup).length,
    [rows, isDup],
  );
  const bloqueado = paraSalvar.length === 0 || incluidasIncompletas > 0;
  const prontos = paraSalvar.length;

  // ---- Baixar modelo .xlsx --------------------------------------------------
  const baixarModelo = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // SÓ o cabeçalho — sem linha de exemplo de dados (uma linha de exemplo
    // acabaria importada como produto real se o usuário não a apagasse).
    const wsProdutos = XLSX.utils.aoa_to_sheet([[...COLUNAS_MODELO]]);
    wsProdutos["!cols"] = [{ wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 22 }];
    // Formata a coluna "Código de barras" (D) como TEXTO para o Excel não
    // converter o código em número (que perde zeros à esquerda / vira 7.8E+12).
    // Marca o cabeçalho como texto e deixa o formato de coluna como '@'.
    const d1 = wsProdutos["D1"];
    if (d1) d1.z = "@";
    XLSX.utils.book_append_sheet(wb, wsProdutos, "Produtos");

    const wsInstrucoes = XLSX.utils.aoa_to_sheet([
      ["Como usar este modelo"],
      [""],
      ['1. Preencha uma linha por produto na aba "Produtos".'],
      ["2. Coluna obrigatória na planilha: Descrição."],
      ["   Unidade (ex.: un, cx, mL), Quantidade e Código de barras são opcionais."],
      ["3. Quantidade: use ponto ou vírgula para decimais (ex.: 1.5 ou 1,5)."],
      ["4. Código de barras: formate a coluna como TEXTO (ou comece com um"],
      ["   apóstrofo ') para não perder zeros à esquerda nem virar 7,8E+12."],
      ["5. NÃO preencha classificação/lote/validade aqui — isso é feito na tela."],
      ["6. Salve o arquivo e faça o upload na tela Importar Produtos."],
      ["7. Na tela: classifique cada produto (Grupo, Classificação,"],
      ["   Subclassificação) e informe Lote/Validade; depois clique em Salvar."],
      [""],
      ["Exemplo de linha (aba Produtos): Dipirona Sódica 500mg/mL | un | 100 | 7891234567890"],
    ]);
    wsInstrucoes["!cols"] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInstrucoes, "Instruções");

    XLSX.writeFile(wb, "modelo-produtos-agicare.xlsx");
  }, []);

  // ---- Upload / parse -------------------------------------------------------
  const handleFile = useCallback(
    async (file: File) => {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheetName =
          wb.SheetNames.find((n) => n.toLowerCase() === "produtos") ??
          wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        if (!ws) {
          toast.error("Planilha vazia ou sem aba de dados.");
          return;
        }
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: "",
        });
        if (json.length === 0) {
          toast.error("Nenhuma linha encontrada na planilha.");
          return;
        }
        // Valida que existe a coluna Descrição (case-insensitive).
        const chaves = Object.keys(json[0]);
        const kDescricao = chaves.find(
          (k) => k.trim().toLowerCase() === "descrição" || k.trim().toLowerCase() === "descricao",
        );
        if (!kDescricao) {
          toast.error('A planilha precisa ter a coluna "Descrição".');
          return;
        }
        const kUnidade = chaves.find((k) => k.trim().toLowerCase() === "unidade");
        const kQtd = chaves.find((k) => k.trim().toLowerCase() === "quantidade");
        const kBarras = chaves.find(
          (k) =>
            k.trim().toLowerCase() === "código de barras" ||
            k.trim().toLowerCase() === "codigo de barras",
        );

        const parsed: GridRow[] = json
          .map((r) => {
            const descricao = String(r[kDescricao] ?? "").trim();
            const unidade = kUnidade ? String(r[kUnidade] ?? "").trim() : "";
            return novaGridRow({
              descricao,
              unidade: unidade || "un",
              quantidade: kQtd ? parseQuantidade(r[kQtd]) : 0,
              codigoBarras: kBarras ? codigoBarrasTexto(r[kBarras]) : "",
              grupo: "",
              classificacao: "",
              subclassificacao: "",
              lote: "",
              validade: "",
            });
          })
          .filter((r) => r.descricao !== "");

        if (parsed.length === 0) {
          toast.error("Nenhuma linha com Descrição preenchida.");
          return;
        }
        if (parsed.length > MAX_IMPORT) {
          toast.error(
            `A planilha tem ${parsed.length} produtos. O máximo por importação é ${MAX_IMPORT} — divida em partes.`,
          );
          return;
        }
        setRows(parsed);
        toast.success(
          `${parsed.length} produto(s) carregado(s). Classifique cada um antes de salvar.`,
        );
      } catch {
        toast.error("Não foi possível ler o arquivo. Envie um .xlsx válido.");
      }
    },
    [],
  );

  // ---- Mutação de linha (estável por id) ------------------------------------
  const updateRow = useCallback((id: string, patch: Partial<ProdutoImportRow>) => {
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r._id !== id));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, novaGridRow()]);
  }, []);

  const toggleManter = useCallback((id: string) => {
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, manterDup: !r.manterDup } : r)),
    );
  }, []);

  // Remove as linhas duplicadas que NÃO foram marcadas "importar assim mesmo".
  // Recalcula a duplicidade aqui dentro para não depender de estado defasado.
  const removerDuplicados = useCallback(() => {
    setRows((prev) => {
      const seen = new Set<string>();
      return prev.filter((r) => {
        const k = chaveNome(r.descricao);
        const plan = k !== "" && seen.has(k);
        const exist = k !== "" && existentesSet.has(k);
        if (k !== "") seen.add(k);
        const dup = plan || exist;
        return !dup || r.manterDup; // mantém não-duplicados e os forçados
      });
    });
  }, [existentesSet]);

  const copiarClassificacao = useCallback(() => {
    setRows((prev) => {
      if (prev.length === 0) return prev;
      const primeira = prev[0];
      if (
        !primeira.grupo ||
        !primeira.classificacao ||
        !primeira.subclassificacao
      ) {
        toast.error("Classifique a 1ª linha completamente primeiro.");
        return prev;
      }
      return prev.map((r) => ({
        ...r,
        grupo: primeira.grupo,
        classificacao: primeira.classificacao,
        subclassificacao: primeira.subclassificacao,
      }));
    });
  }, []);

  // ---- Salvar ---------------------------------------------------------------
  const salvar = useCallback(async () => {
    if (bloqueado) return;
    setSalvando(true);
    try {
      // Envia só as linhas incluídas + completas; descarta campos de UI
      // (_id, manterDup) antes de mandar ao servidor.
      const payload: ProdutoImportRow[] = paraSalvar.map(
        ({ _id: _drop, manterDup: _m, ...r }) => r,
      );
      const res = await importarProdutosEmMassa(payload);
      if (res.ok) {
        toast.success(`${res.inseridos} produtos importados`);
        router.push("/estoque");
        router.refresh();
      } else {
        toast.error(res.error ?? "Falha ao importar produtos.");
      }
    } catch {
      toast.error("Erro inesperado ao importar produtos.");
    } finally {
      setSalvando(false);
    }
  }, [bloqueado, paraSalvar, router]);

  return (
    <Stagger className="mt-6 space-y-4">
      {/* Ações de arquivo */}
      <FadeInUp>
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={baixarModelo}>
              <Download className="h-4 w-4" /> Baixar modelo .xlsx
            </Button>
            <Button
              variant="primary"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Enviar planilha
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label="Selecionar planilha de produtos"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = ""; // permite reenviar o mesmo arquivo
              }}
            />
            <p className="flex items-center gap-2 text-sm text-muted">
              <FileSpreadsheet className="h-4 w-4" />
              Baixe o modelo, preencha e envie. A classificação é feita aqui na
              grade.
            </p>
          </div>
        </Card>
      </FadeInUp>

      {rows.length > 0 && (
        <FadeInUp>
          <Card className="overflow-hidden">
            {/* Barra de status + conveniências */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {incluidasIncompletas > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-status-warn" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-status-ok" />
                )}
                <span className="font-medium text-ink">
                  {prontos} para salvar
                </span>
                <span className="text-muted">de {rows.length} linha(s)</span>
                {incluidasIncompletas > 0 && (
                  <span className="text-status-warn">
                    · {incluidasIncompletas} a classificar
                  </span>
                )}
                {duplicadosExcluidos > 0 && (
                  <span className="text-status-danger">
                    · {duplicadosExcluidos} duplicado(s) fora
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {duplicadosExcluidos > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={removerDuplicados}
                  >
                    <Trash2 className="h-4 w-4" /> Remover duplicados
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={copiarClassificacao}>
                  <CopyCheck className="h-4 w-4" /> Copiar classificação da 1ª
                  linha
                </Button>
                <Button size="sm" variant="ghost" onClick={addRow}>
                  <Plus className="h-4 w-4" /> Adicionar linha
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-muted">
                    <th className="px-3 py-3 font-medium">Descrição *</th>
                    <th className="px-3 py-3 font-medium">Un.</th>
                    <th className="px-3 py-3 font-medium">Qtd.</th>
                    <th className="px-3 py-3 font-medium">Grupo *</th>
                    <th className="px-3 py-3 font-medium">Classificação *</th>
                    <th className="px-3 py-3 font-medium">Subclassificação *</th>
                    <th className="px-3 py-3 font-medium">Lote</th>
                    <th className="px-3 py-3 font-medium">Validade</th>
                    <th className="px-3 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <LinhaGrade
                      key={r._id}
                      row={r}
                      categorias={categorias}
                      dupPlanilha={dupInfo[r._id]?.plan ?? false}
                      dupExistente={dupInfo[r._id]?.exist ?? false}
                      onChange={updateRow}
                      onRemove={removeRow}
                      onToggleManter={toggleManter}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </FadeInUp>
      )}

      {rows.length > 0 && (
        <FadeInUp>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setRows([])}
              disabled={salvando}
            >
              Limpar tudo
            </Button>
            <Button
              variant="primary"
              onClick={salvar}
              disabled={bloqueado || salvando}
              title={
                bloqueado
                  ? "Classifique as linhas incluídas antes de salvar"
                  : undefined
              }
            >
              {salvando
                ? "Salvando..."
                : `Salvar ${prontos} produto${prontos !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </FadeInUp>
      )}
    </Stagger>
  );
}

// ---------------------------------------------------------------------------
// Linha memoizada: só re-renderiza quando SUA row muda (grades grandes).
// ---------------------------------------------------------------------------
const LinhaGrade = memo(function LinhaGrade({
  row,
  categorias,
  dupPlanilha,
  dupExistente,
  onChange,
  onRemove,
  onToggleManter,
}: {
  row: GridRow;
  categorias: ProductCategoryNode[];
  dupPlanilha: boolean;
  dupExistente: boolean;
  onChange: (id: string, patch: Partial<ProdutoImportRow>) => void;
  onRemove: (id: string) => void;
  onToggleManter: (id: string) => void;
}) {
  const completa = linhaCompleta(row);
  const duplicado = dupPlanilha || dupExistente;
  // Duplicado sem "importar assim mesmo" → destaque vermelho e fora do save.
  const dupExcluido = duplicado && !row.manterDup;

  const noGrupo = categorias.find((g) => g.label === row.grupo);
  const noClassif = noGrupo?.children.find((c) => c.label === row.classificacao);

  const opcoesGrupo = opcoes(categorias, row.grupo);
  const opcoesClassif = opcoes(noGrupo?.children ?? [], row.classificacao);
  const opcoesSub = opcoes(noClassif?.children ?? [], row.subclassificacao);

  const semGrupo = row.grupo === "";
  const semClassif = row.classificacao === "";

  const trCls = dupExcluido
    ? "border-b border-l-2 border-l-status-danger border-line bg-status-danger/5 last:border-b-0"
    : completa
      ? "border-b border-line last:border-0"
      : "border-b border-l-2 border-l-status-warn border-line bg-status-warn/5 last:border-b-0";

  return (
    <tr className={trCls}>
      <td className="px-3 py-2 align-top">
        <Input
          aria-label="Descrição"
          value={row.descricao}
          error={
            row.descricao.trim().length < 2 ? "Mín. 2 caracteres" : undefined
          }
          onChange={(e) => onChange(row._id, { descricao: e.target.value })}
          className="min-w-[220px]"
        />
        {duplicado && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium " +
                (dupExcluido
                  ? "bg-status-danger/10 text-status-danger"
                  : "bg-muted/10 text-muted")
              }
            >
              <AlertTriangle className="h-3 w-3" />
              {dupExistente ? "Já existe no estoque" : "Repetido na planilha"}
            </span>
            <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={!!row.manterDup}
                onChange={() => onToggleManter(row._id)}
              />
              Importar assim mesmo
            </label>
          </div>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <Input
          aria-label="Unidade"
          value={row.unidade}
          onChange={(e) => onChange(row._id, { unidade: e.target.value })}
          className="w-16"
        />
      </td>
      <td className="px-3 py-2 align-top">
        <Input
          aria-label="Quantidade"
          type="number"
          min={0}
          value={Number.isFinite(row.quantidade) ? row.quantidade : 0}
          onChange={(e) =>
            onChange(row._id, { quantidade: Number(e.target.value) || 0 })
          }
          className="w-20"
        />
      </td>
      <td className="px-3 py-2 align-top">
        <Select
          aria-label="Grupo"
          value={row.grupo}
          onChange={(e) =>
            onChange(row._id, {
              grupo: e.target.value,
              classificacao: "",
              subclassificacao: "",
            })
          }
          className="min-w-[160px]"
        >
          <option value="">Selecione</option>
          {opcoesGrupo.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-2 align-top">
        <Select
          aria-label="Classificação"
          value={row.classificacao}
          disabled={semGrupo}
          title={semGrupo ? "Selecione um grupo primeiro" : undefined}
          onChange={(e) =>
            onChange(row._id, {
              classificacao: e.target.value,
              subclassificacao: "",
            })
          }
          className="min-w-[160px]"
        >
          <option value="">
            {semGrupo ? "Selecione um grupo antes" : "Selecione"}
          </option>
          {opcoesClassif.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-2 align-top">
        <Select
          aria-label="Subclassificação"
          value={row.subclassificacao}
          disabled={semClassif}
          title={semClassif ? "Selecione uma classificação primeiro" : undefined}
          onChange={(e) =>
            onChange(row._id, { subclassificacao: e.target.value })
          }
          className="min-w-[160px]"
        >
          <option value="">
            {semClassif ? "Selecione uma classificação antes" : "Selecione"}
          </option>
          {opcoesSub.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-2 align-top">
        <Input
          aria-label="Lote"
          value={row.lote}
          onChange={(e) => onChange(row._id, { lote: e.target.value })}
          className="w-24"
        />
      </td>
      <td className="px-3 py-2 align-top">
        <Input
          aria-label="Validade"
          type="date"
          value={row.validade}
          onChange={(e) => onChange(row._id, { validade: e.target.value })}
          className="w-40"
        />
      </td>
      <td className="px-3 py-2 text-right align-top">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRemove(row._id)}
          aria-label="Remover linha"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
});

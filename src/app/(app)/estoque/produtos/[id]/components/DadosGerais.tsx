"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Checkbox, Toggle, SectionTitle } from "./ui";
import type { ProdutoCompleto } from "../types";
import type { AttendanceOptionsByCategory } from "@/lib/data/attendance-options.shared";
import type { ProductCategoryNode } from "@/lib/data/product-categories";

/**
 * Rótulos ofertados num select de categoria: os nós ATIVOS do nível +, se o
 * valor salvo no produto não estiver entre eles (categoria renomeada, inativada
 * ou excluída), o próprio valor legado — para ele não sumir silenciosamente do
 * formulário e ser reenviado como texto vazio no submit.
 */
function opcoesComLegado(nos: ProductCategoryNode[], valor: string): string[] {
  const ativos = nos.filter((n) => n.active).map((n) => n.label);
  return valor && !ativos.includes(valor) ? [valor, ...ativos] : ativos;
}

export function DadosGerais({
  produto,
  options,
  categorias,
  novo,
  ativo,
  setAtivo,
}: {
  produto: ProdutoCompleto;
  options: AttendanceOptionsByCategory;
  /** Árvore Grupo → Classificação → Subclassificação (configurações). */
  categorias: ProductCategoryNode[];
  novo: boolean;
  ativo: boolean;
  setAtivo: (v: boolean) => void;
}) {
  const tipos = options.tipo_produto || [];

  // Os 3 selects de categoria são encadeados, logo controlados. O valor
  // trafegado (e persistido em stock_products) continua sendo o LABEL em texto.
  const [grupo, setGrupo] = useState(produto.productGroup ?? "");
  const [classificacao, setClassificacao] = useState(produto.classification ?? "");
  const [subclassificacao, setSubclassificacao] = useState(
    produto.subclassification ?? "",
  );

  // Navegação da árvore por rótulo: buscamos entre TODOS os nós (inclusive
  // inativos) para que um grupo legado ainda revele seus filhos.
  const noGrupo = categorias.find((g) => g.label === grupo);
  const noClassificacao = noGrupo?.children.find((c) => c.label === classificacao);

  const opcoesGrupo = opcoesComLegado(categorias, grupo);
  const opcoesClassificacao = opcoesComLegado(
    noGrupo?.children ?? [],
    classificacao,
  );
  const opcoesSubclassificacao = opcoesComLegado(
    noClassificacao?.children ?? [],
    subclassificacao,
  );

  // O filho só abre depois do pai escolhido — o que também cobre o caso legado,
  // já que um valor legado preenchido conta como "pai escolhido".
  const semGrupo = grupo === "";
  const semClassificacao = classificacao === "";

  return (
    <div className="space-y-4">
      {/* Dados Básicos */}
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Código
            </span>
            <span className="inline-flex h-10 w-full items-center gap-2 rounded-lg bg-brand-50 px-3 text-sm font-semibold text-brand-600">
              {novo ? (
                <>
                  AUTO
                  <span className="text-xs font-normal text-muted">
                    gerado ao salvar
                  </span>
                </>
              ) : (
                produto.codigo || "—"
              )}
            </span>
          </div>
          <div className="flex items-end">
            <Toggle label="Ativo" checked={ativo} onChange={setAtivo} />
          </div>
          <Input
            id="pr-nome"
            name="name"
            label="Descrição *"
            placeholder="Ex.: Dipirona Sódica 500mg/mL"
            required
            defaultValue={produto.name}
            className="sm:col-span-2 lg:col-span-2"
          />
        </div>
      </Card>

      {/* Classificação */}
      <Card className="p-5">
        <SectionTitle>Classificação</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            id="pr-tipo"
            name="product_type"
            label="Tipo de Produto"
            defaultValue={produto.productType ?? ""}
          >
            <option value="">Selecione</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.label}>{t.label}</option>
            ))}
          </Select>
          <Select
            id="pr-grupo"
            name="product_group"
            label="Grupo"
            value={grupo}
            onChange={(e) => {
              // Trocar o grupo invalida os níveis abaixo.
              setGrupo(e.target.value);
              setClassificacao("");
              setSubclassificacao("");
            }}
          >
            <option value="">Selecione</option>
            {opcoesGrupo.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </Select>
          <Select
            id="pr-classif"
            name="classification"
            label="Classificação"
            value={classificacao}
            disabled={semGrupo}
            title={semGrupo ? "Selecione um grupo primeiro" : undefined}
            onChange={(e) => {
              setClassificacao(e.target.value);
              setSubclassificacao("");
            }}
          >
            <option value="">
              {semGrupo ? "Selecione um grupo antes" : "Selecione"}
            </option>
            {opcoesClassificacao.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </Select>
          {/* Select desabilitado não entra no FormData, e o update ignora campos
              ausentes (mantendo o valor antigo). O hidden garante a limpeza. */}
          {semGrupo && <input type="hidden" name="classification" value="" />}
          {semClassificacao && (
            <input type="hidden" name="subclassification" value="" />
          )}
          <Select
            id="pr-subclassif"
            name="subclassification"
            label="Subclassificação"
            value={subclassificacao}
            disabled={semClassificacao}
            title={
              semClassificacao ? "Selecione uma classificação primeiro" : undefined
            }
            onChange={(e) => setSubclassificacao(e.target.value)}
          >
            <option value="">
              {semClassificacao ? "Selecione uma classificação antes" : "Selecione"}
            </option>
            {opcoesSubclassificacao.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </Select>
          <Input
            id="pr-ncm"
            name="ncm"
            label="NCM"
            placeholder="Ex.: 3004.90.69"
            defaultValue={produto.ncm ?? ""}
          />
          <Input
            id="pr-cfop"
            name="cfop"
            label="CFOP"
            placeholder="Ex.: 5405"
            defaultValue={produto.cfop ?? ""}
          />
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Checkbox
              name="port_344"
              label="Port. 344/98"
              defaultChecked={produto.port344}
            />
          </div>
        </div>
      </Card>
      
      {/* Controle */}
      <Card className="p-5">
        <SectionTitle>Controle</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <Checkbox name="ctrl_lote_validade" label="Lote e Validade" defaultChecked={produto.ctrlLoteValidade} />
          <Checkbox name="ctrl_opme" label="OPME" defaultChecked={produto.ctrlOpme} />
          <Checkbox name="ctrl_numero_serie" label="Número Série" defaultChecked={produto.ctrlNumeroSerie} />
          <Checkbox name="ctrl_marca" label="Marca" defaultChecked={produto.ctrlMarca} />
        </div>
      </Card>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Package, MapPin, Pencil, Plus, FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { type ProdutoEstoque, type Fornecedor } from "@/lib/data/stock";
import { moedaBR } from "./format";

export function CadastroTab({
  produtos,
  fornecedores: _fornecedores,
  gestor,
}: {
  produtos: ProdutoEstoque[];
  fornecedores: Fornecedor[];
  gestor: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");

  const categorias = useMemo(
    () => Array.from(new Set(produtos.map((p) => p.categoria))).sort(),
    [produtos],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      const okCat = categoria === "todas" || p.categoria === categoria;
      const okBusca =
        !q ||
        p.produto.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q);
      return okCat && okBusca;
    });
  }, [produtos, busca, categoria]);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Cadastro de Produtos</h2>
          <p className="text-sm text-muted">
            Catálogo de medicamentos, materiais e insumos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gestor && (
            <Button
              variant="outline"
              onClick={() => router.push("/estoque/produtos/importar")}
            >
              <FileSpreadsheet className="h-4 w-4" /> Importar Excel
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => router.push("/estoque/produtos/novo")}
          >
            <Plus className="h-4 w-4" /> Novo Produto
          </Button>
        </div>
      </div>

      <Card className="mt-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              placeholder="Buscar por nome ou código..."
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="sm:w-56">
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="todas">Todas as Categorias</option>
              {categorias.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-5 py-3 font-medium">Código</th>
                <th className="px-5 py-3 font-medium">Produto</th>
                <th className="px-5 py-3 font-medium">Categoria</th>
                <th className="px-5 py-3 font-medium">Localização</th>
                <th className="px-5 py-3 font-medium">Saldo</th>
                <th className="px-5 py-3 font-medium">Mínimo</th>
                {gestor && <th className="px-5 py-3 font-medium">Custo</th>}
                {gestor && <th className="px-5 py-3 font-medium">Preço</th>}
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={gestor ? 10 : 8} className="px-5 py-10 text-center text-muted">
                    <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <Badge status="active">{p.codigo}</Badge>
                    </td>
                    <td className="px-5 py-3 font-medium text-ink">{p.produto}</td>
                    <td className="px-5 py-3 text-muted">{p.categoria}</td>
                    <td className="px-5 py-3 text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> {p.localizacao}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink">{p.saldo}</td>
                    <td className="px-5 py-3 text-muted">{p.minimo}</td>
                    {gestor && <td className="px-5 py-3 text-muted">{moedaBR(p.custo)}</td>}
                    {gestor && <td className="px-5 py-3 text-ink">{moedaBR(p.preco)}</td>}
                    <td className="px-5 py-3">
                      <Badge status={p.status.tone}>{p.status.label}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/estoque/produtos/${p.id}`)}
                        aria-label={`Editar ${p.produto}`}
                      >
                        <Pencil className="h-4 w-4" /> Editar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

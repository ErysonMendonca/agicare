# Briefing do Design System — agicare (para a equipe)

Use SOMENTE as primitivas abaixo (já criadas). NÃO edite arquivos compartilhados
(`globals.css`, componentes existentes, layout). Crie apenas a sua `page.tsx`.

## Imports disponíveis
```tsx
import { PageHeader } from "@/components/app/PageHeader";       // title, subtitle, actions
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";                // variant: primary|outline|ghost|danger; size: sm|md
import { Input } from "@/components/ui/Input";                  // label?, placeholder...
import { Select } from "@/components/ui/Select";                // label?, <option> children
import { Badge } from "@/components/ui/Badge";                  // status: wait|active|ok|danger|warn
import { Avatar } from "@/components/ui/Avatar";                // name
import { StatCard } from "@/components/ui/StatCard";            // icon, value, label, change?{value,positive}, tone: brand|blue|green|orange|purple
import { AreaChart, BarChart } from "@/components/ui/Charts";   // AreaChart: series:{name,color,values:number[]}[] (interativo); BarChart: series:number[]; labels:string[]
import { ICON } from "lucide-react";                            // ícones
```

## Tokens (classes Tailwind v4)
- Cores: `brand-50..900` (primária `brand-500` = #0DB8C2), `accent`, `ink` (texto), `muted` (texto 2º),
  `canvas` (fundo), `surface` (card branco), `line` (borda).
- Status (badges): `wait` azul · `active` teal · `ok` verde · `danger` vermelho · `warn` laranja.
- Card: `rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]` (ou use `<Card>`).
- Fonte Inter (global). Título de página via `<PageHeader>`. Conteúdo já tem `p-6` do layout.

## Padrão de tela (todas seguem isto)
1. `<PageHeader title="..." subtitle="..." actions={<Button>...</Button>} />`
2. Linha de **StatCards** (KPIs) — `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4` (ou 5 colunas se houver 5 KPIs).
3. Card de **filtros** (Input de busca + Selects).
4. Card de **lista/tabela** com cabeçalho ("Lista de ... (N)") + ação "Exportar", linhas com Avatar/Badges/Button "Ver Ficha".
   - Quando a tela mostrar vazio, faça um **empty-state** centralizado (ícone grande, título, subtítulo).

## Tabela — padrão
```tsx
<Card className="overflow-hidden">
  <div className="flex items-center justify-between p-5">
    <h3 className="font-semibold text-ink">Lista de X <span className="text-muted">(N)</span></h3>
    <Button variant="outline" size="sm">Exportar</Button>
  </div>
  <table className="w-full text-sm">
    <thead><tr className="border-y border-line text-left text-xs uppercase text-muted">
      <th className="px-5 py-3 font-medium">Coluna</th>…
    </tr></thead>
    <tbody>{rows.map(r => (
      <tr key={r.id} className="border-b border-line last:border-0">
        <td className="px-5 py-3">…</td>…
      </tr>
    ))}</tbody>
  </table>
</Card>
```

## Regras
- Server Component por padrão; só use `"use client"` se houver estado/eventos.
- Dados mockados (arrays no topo do arquivo) fiéis ao screenshot. PT-BR.
- NÃO rode `npm run build`/`dev` (o tech-lead valida no fim). NÃO instale libs.
- Replique fielmente o screenshot indicado em `docs/figma-shots/`.

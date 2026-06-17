# Briefing — ligar módulos ao banco + animações (para a equipe)

## Padrão de data layer (espelhe `src/lib/data/patients.ts`)
Crie `src/lib/data/<modulo>.ts` exportando uma função async que retorna o tipo que a página já usa:
```ts
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

const MOCK: Item[] = [ /* mantenha o mock que já está na page como fallback do modo demo */ ];

export async function listX(): Promise<Item[]> {
  if (isDemoMode()) return MOCK;
  const supabase = await createClient();
  const { data, error } = await supabase.from("<tabela>").select("<colunas>").order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({ /* mapeie colunas do banco → shape do componente */ }));
}
```
Depois converta a `page.tsx` em **Server Component async** (`export default async function`), chame `listX()`,
**calcule os KPIs a partir dos dados** (não deixe números hardcoded) e troque o array mockado pelos dados.

## Animações (já existem — só consuma)
- KPIs via `StatCard` já fazem **count-up automático** (não mude). Para KPIs custom (Cards próprios, ex.: faturamento),
  envolva o número em `<CountUp value={valor} />` de `@/components/ui/CountUp`.
- Envolva a grade de KPIs e a lista/cards principais com entrada em stagger:
  ```tsx
  import { Stagger, FadeInUp } from "@/components/ui/Motion";
  <Stagger className="grid ...">
    <FadeInUp><StatCard .../></FadeInUp>
    ...
  </Stagger>
  ```
  Para listas longas (tabelas), NÃO embrulhe cada linha (custo); embrulhe o Card container num único `<FadeInUp>` dentro de um `<Stagger>`.
- Cards clicáveis podem receber `interactive` no `<Card interactive>` (hover-lift). Botões já têm micro-interação.

## Colunas das tabelas (Supabase)
- **appointments** (agenda): `id, patient_id, professional_id, starts_at(timestamptz), ends_at, status('agendado'|'confirmado'|'em_atendimento'|'concluido'|'cancelado'|'faltou'), reason, created_at`. Para nome do paciente/profissional faça join: `.select("*, patients(full_name), professionals(specialty, profiles(full_name))")`.
- **queue_entries** (fila): `id, ticket_code, patient_id, patient_name, priority('normal'|'preferencial'|'urgente'), professional_id, specialty, insurance, status('aguardando'|'chamado'|'em_atendimento'|'finalizado'), created_at`. Para o nome do profissional: `.select("*, professionals(profiles(full_name))")`.
- **procedures** (procedimentos): `id, code, name, description, category, duration_min, price(numeric), margin_pct(int), active, created_at`.
- **stock_products** (estoque): `id, code, name, category, unit, quantity, min_quantity, lot, active, created_at`. Item crítico = `quantity < min_quantity`.
- **billable_events** (faturamento): `id, code, patient_id, professional_id, kind('convenio'|'particular'), service, amount(numeric), status('pendente'|'faturado'|'glosado'), created_at`. Joins: `patients(full_name), professionals(profiles(full_name))`.
- **lab_cases** (laboratório): `id, code, patient_id, type, status('em_andamento'|'pendente'|'finalizado'), urgent(bool), due_date(date), created_at`. Join `patients(full_name)`.
- **professionals**: `id, profile_id, specialty, council_reg, bio, active, created_at`. Nome/contato via `profiles(full_name, phone)`: `.select("*, profiles(full_name, phone, role)")`.
- **patients** (referência): `id, full_name, cpf, phone, email, convenio, blood_type, allergies, in_treatment, active, created_at`.

## Mapeamento de status → Badge (componente `@/components/ui/Badge`, prop `status`)
`aguardando→wait` · `chamado/em_atendimento→active` · `confirmado/concluido/finalizado/ativo→ok` ·
`urgente/glosado/cancelado/faltou→danger` · `preferencial/pendente→warn`.

## Regras
- Mantenha o LAYOUT/JSX atual da página (não redesenhe) — só troque dados mock por dados do banco + KPIs calculados + entrada animada.
- Server Component por padrão; partes com estado/efeito ficam em ilhas client separadas.
- NÃO rode `npm run build`/`dev`. NÃO edite componentes compartilhados nem outras páginas. NÃO instale libs.
- PT-BR.

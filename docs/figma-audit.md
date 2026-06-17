# Auditoria do Figma — agicare

Fonte: https://afar-patron-55557012.figma.site/ — **"AGIcare — Sistema de Gestão Clínica Inteligente"** (PT-BR).
Protótipo funcional do Figma. Telas internas atrás de login demo. Screenshots em `docs/figma-shots/`.

## Acesso (demo do protótipo)
- **Login usuário** (`/`): usuário = qualquer (ex.: `João`), senha = `123456`, + seleção de clínica.
- **Login admin** (`/admin/login`): `admin` / `admin123`.

## Estrutura (app shell)
- **Sidebar** (~240px, gradiente vertical teal→verde, escurece embaixo):
  - Topo: logo **AGI**`care` (AGI bold branco, care leve, swoosh sob "care").
  - Nav (ícones lucide): Dashboard · Fila de Atendimento `(6)` · Pacientes · Agenda · Prontuário ·
    Procedimentos · Laboratório · Profissionais · Estoque `(3)` · Faturamento · Relatórios · Configurações.
  - Item **ativo**: pílula branca, texto/ícone teal. Inativo: texto claro sobre o gradiente. Badges numéricos.
  - Rodapé: card de perfil "Dr. João Silva / Médico", avatar "DJ", chevron.
- **Topbar**: ícone recolher (X), busca central "Buscar… ⌘K", à direita sino de notificação + usuário/avatar.
- **Conteúdo**: fundo cinza-claro; **PageHeader** (título grande + subtítulo + ações à direita);
  geralmente uma linha de **StatCards (KPIs)**, depois filtros e lista/tabela/empty-state.

## Telas (uma rota por módulo)
| # | Módulo | Rota alvo | Conteúdo |
|---|--------|-----------|----------|
| 1 | Dashboard | `/dashboard` | 4 KPIs + gráfico de área "Atendimentos Mensais" + gráfico de barras "Receita" |
| 2 | Fila de Atendimento | `/fila` | 4 KPIs (Aguardando/Chamados/Em Atendimento/Total) + busca + cards de fila (código, nome, tags, status) |
| 3 | Pacientes | `/pacientes` | 4 KPIs + busca/status + tabela (paciente, contato, convênio, tipo sang., status, ações) + "Novo Paciente" |
| 4 | Agenda | `/agenda` | 5 KPIs (Total/Agendados/Confirmados/Em Atendimento/Finalizados) + filtros (data, profissional, status) + lista/empty + "Novo Agendamento", "Escala de Horários" |
| 5 | Prontuário | `/prontuario` | screenshot `app__07_prontu_rio.png` |
| 6 | Procedimentos | `/procedimentos` | `app__08_procedimentos.png` |
| 7 | Laboratório | `/laboratorio` | `app__09_laborat_rio.png` |
| 8 | Profissionais | `/profissionais` | `app__10_profissionais.png` |
| 9 | Estoque | `/estoque` | `app__11_estoque.png` |
| 10 | Faturamento | `/faturamento` | `app__12_faturamento.png` |
| 11 | Relatórios | `/relatorios` | `app__13_relat_rios.png` |
| 12 | Configurações | `/configuracoes` | `app__14_configura_es.png` |

> Cada módulo replicar a partir do screenshot correspondente em `docs/figma-shots/app__*.png`.

## Design tokens (extraídos — `docs/figma-dom.json`)
- **Fonte:** `Inter` (todo o sistema).
- **Primária (teal):** `#0DB8C2` — botões, item ativo, links/realces.
- **Accent verde:** `#0BE0AE` (fim do gradiente).
- **Gradiente de marca:** `linear-gradient(to bottom right, #0DB8C2 0%, #8DE1EC 50%, #0BE0AE 100%)`
  (usado no fundo do login; a sidebar usa a versão vertical/escurecida).
- **Fundo conteúdo:** cinza muito claro (~`#F6F8FA`). **Cards:** branco, raio ~12–16px, borda clara, sombra sutil.
- **Inputs/Select:** branco, raio 8px, placeholder `#71717A` (zinc-500).
- **Tipografia:** H1 página ~30px/700; H2 card/título ~24px; labels 14px; texto base 14–16px.
- **Status (badges pílula, bg suave + texto forte):**
  - Aguardando → azul · Chamado/Em Atendimento → teal · Ativo/Finalizado → verde ·
    Urgente → vermelho · Preferencial → laranja.
- **Variação KPI:** badge verde (+) / vermelho (−) no canto superior direito do card.

## Componentes recorrentes a criar (`src/components/ui` + `src/components/app`)
AppShell (Sidebar, Topbar) · PageHeader · StatCard · Card · Table · Badge/StatusBadge ·
Button (primary/outline) · Input · Select · SearchInput · Avatar · EmptyState · QueueCard ·
Charts (área + barras — placeholder leve, sem libs pesadas).

"use client";

import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Checkbox, SectionTitle } from "./ui";
import type { ProdutoCompleto } from "../types";

export function ControlePrescricao({
  produto,
}: {
  produto: ProdutoCompleto;
}) {
  return (
    <div className="space-y-4">
      {/* Prescrição Médica */}
      <Card className="p-5">
        <SectionTitle>Prescrição Médica</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
          <Checkbox name="presc_qualquer_via" label="Qualquer Via de Administração" defaultChecked={produto.prescQualquerVia} />
          <Checkbox name="presc_qualquer_frequencia" label="Qualquer Frequência" defaultChecked={produto.prescQualquerFrequencia} />
          <Checkbox name="presc_se_necessario" label='Prescrito "Se Necessário"' defaultChecked={produto.prescSeNecessario} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            id="pr-solicita"
            name="solicita_se_necessario"
            label="Solicita Se Necessário"
            defaultValue={produto.solicitaSeNecessario ?? "NAO SOLICITA"}
          >
            <option value="NAO SOLICITA">NÃO SOLICITA</option>
            <option value="SOLICITA">SOLICITA</option>
          </Select>
          <Select
            id="pr-sal"
            name="sal_principio_ativo"
            label="Sal/Princípio Ativo"
            defaultValue={produto.salPrincipioAtivo ?? "NAO SUBSTITUI"}
          >
            <option value="NAO SUBSTITUI">NÃO SUBSTITUI</option>
            <option value="SUBSTITUI">SUBSTITUI</option>
          </Select>
        </div>
      </Card>

      {/* Outras Informações */}
      <Card className="p-5">
        <SectionTitle>Outras Informações</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <Checkbox name="info_alto_custo" label="Alto Custo" defaultChecked={produto.infoAltoCusto} />
          <Checkbox name="info_alto_risco" label="Alto Risco" defaultChecked={produto.infoAltoRisco} />
          <Checkbox name="info_urgencia" label="Urgência" defaultChecked={produto.infoUrgencia} />
          <Checkbox name="info_oncologia" label="Oncologia" defaultChecked={produto.infoOncologia} />
          <Checkbox name="info_antimicrobiano_restrito" label="Antimicrobiano de Uso Restrito" defaultChecked={produto.infoAntimicrobianoRestrito} />
          <Checkbox name="info_dva" label="Droga Vasoativa (DVA)" defaultChecked={produto.infoDva} />
          <Checkbox name="info_uso_continuo" label="Medicamento de Uso Contínuo" defaultChecked={produto.infoUsoContinuo} />
          <Checkbox name="info_nao_padrao" label="Não Padrão" defaultChecked={produto.infoNaoPadrao} />
        </div>
      </Card>

      {/* Solução Composta */}
      <Card className="p-5">
        <SectionTitle>Solução Composta</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Checkbox name="sol_componente_diluido" label="Componente Diluído" defaultChecked={produto.solComponenteDiluido} />
          <Checkbox name="sol_componente_diluente" label="Componente Diluente" defaultChecked={produto.solComponenteDiluente} />
        </div>
      </Card>
    </div>
  );
}

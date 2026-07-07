import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  // Verificação de segurança: apenas o Vercel Cron deve conseguir chamar esta rota.
  // Em desenvolvimento, permitimos testes diretos.
  const authHeader = request.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cria o cliente Supabase com a Service Role Key para ignorar o RLS,
  // já que o Cron roda sem contexto de usuário logado.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase credentials missing" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Define o limite de tempo: agendamentos que já passaram há mais de 2 horas.
  const threshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  // Busca agendamentos "agendado" ou "confirmado" que deveriam ter iniciado há mais de 2 horas
  const { data: appointments, error: fetchError } = await supabase
    .from("appointments")
    .select("id, patient_id")
    .in("status", ["agendado", "confirmado"])
    .lt("starts_at", threshold);

  if (fetchError) {
    console.error("Erro ao buscar agendamentos passados:", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!appointments || appointments.length === 0) {
    return NextResponse.json({ message: "Nenhum agendamento para atualizar." });
  }

  const ids = appointments.map((a) => a.id);

  // Atualiza todos para "faltou"
  const { error: updateError } = await supabase
    .from("appointments")
    .update({ status: "faltou" })
    .in("id", ids);

  if (updateError) {
    console.error("Erro ao atualizar status para faltou:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Registra logs de atividade para cada um
  const logs = appointments.map((a) => ({
    action: "update",
    module: "agenda",
    summary: "Status alterado automaticamente para Faltou pelo sistema (limite de horário excedido)",
    entity: "appointment",
    entity_id: a.patient_id, // Atualmente os logs usam patient_id como entity_id
  }));

  await supabase.from("activity_logs").insert(logs);

  return NextResponse.json({
    message: `Sucesso: ${ids.length} agendamentos marcados como faltou.`,
    updatedIds: ids,
  });
}

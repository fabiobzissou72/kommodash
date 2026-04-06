import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.N8N_SUPABASE_URL!,
    process.env.N8N_SUPABASE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const auth = req.cookies.get("auth");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { subdomain?: string } = {};
  try { body = await req.json(); } catch {}

  const subdomain = body.subdomain || "";

  try {
    const sb = getSupabase();

    // Busca todos os registros do subdomínio
    const { data: rows, error } = await sb
      .from("follow_up_tracking")
      .select("*")
      .eq("account_subdomain", subdomain);

    if (error) throw new Error(error.message);

    const all = rows || [];
    const total = all.length;

    const ativos    = all.filter(r => r.status === "waiting").length;
    const respondidos = all.filter(r => r.status === "responded").length;
    const expirados = all.filter(r => r.status === "completed" || (r.follow_up_count || 0) >= 7).length;

    const taxaReengajamento = total > 0
      ? Math.round((respondidos / total) * 100)
      : 0;

    // Taxa de resposta por FUP (FUP1 a FUP7)
    // follow_up_count indica quantas mensagens foram enviadas para esse lead
    // Se status = 'responded' e follow_up_count = N, esse lead respondeu no FUP N
    const fupStats: { fup: string; enviados: number; respondidos: number; conversoes: number }[] = [];
    for (let i = 1; i <= 7; i++) {
      const enviados = all.filter(r => (r.follow_up_count || 0) >= i).length;
      const resp = all.filter(r => (r.follow_up_count || 0) >= i && r.status === "responded").length;
      fupStats.push({
        fup: `FUP${i}`,
        enviados,
        respondidos: resp,
        conversoes: 0, // requer cruzamento com Kommo — implementar depois
      });
    }

    return NextResponse.json({
      ativos,
      taxa_reengajamento: taxaReengajamento,
      conversoes: 0, // requer cruzamento com Kommo
      expirados,
      total,
      fup_stats: fupStats,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erro ao buscar follow-up" }, { status: 500 });
  }
}

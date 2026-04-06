import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const HEALTH_TOKEN = process.env.HEALTH_TOKEN || "";

function getSb() {
  return createClient(process.env.N8N_SUPABASE_URL!, process.env.N8N_SUPABASE_KEY!);
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || token !== HEALTH_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSb();
  const results: Record<string, string | number> = {};

  // Supabase — dados_cliente
  const { count: leadsCount, error: e1 } = await sb
    .from("dados_cliente")
    .select("*", { count: "exact", head: true });
  results.supabase_leads = e1 ? `error: ${e1.message}` : (leadsCount ?? 0);

  // Supabase — bug_ia
  const { count: bugCount, error: e2 } = await sb
    .from("bug_ia")
    .select("*", { count: "exact", head: true });
  results.supabase_bug_ia = e2 ? `error: ${e2.message}` : (bugCount ?? 0);

  // Supabase — nsf_conversations
  const { count: convCount, error: e3 } = await sb
    .from("nsf_conversations")
    .select("*", { count: "exact", head: true });
  results.supabase_conversations = e3 ? `error: ${e3.message}` : (convCount ?? 0);

  // Supabase — follow_up_tracking
  const { count: fupCount, error: e4 } = await sb
    .from("follow_up_tracking")
    .select("*", { count: "exact", head: true });
  results.supabase_followup = e4 ? `error: ${e4.message}` : (fupCount ?? 0);

  // RD Station
  try {
    const rdRes = await fetch(
      `https://crm.rdstation.com/api/v1/deals?token=69cacc672fdda900130b9074&limit=1`,
      { cache: "no-store" }
    );
    results.rd_station = rdRes.ok ? "ok" : `error: ${rdRes.status}`;
  } catch (e: any) {
    results.rd_station = `error: ${e.message}`;
  }

  const allOk = Object.values(results).every(v => v !== "error" && !String(v).startsWith("error"));

  return NextResponse.json({
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks: results,
  });
}

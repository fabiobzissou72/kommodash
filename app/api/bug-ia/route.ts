import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSb() {
  return createClient(process.env.N8N_SUPABASE_URL!, process.env.N8N_SUPABASE_KEY!);
}

export async function POST(req: NextRequest) {
  const auth = req.cookies.get("auth");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { phone?: string; stage?: number | null; descricao?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const sb = getSb();
  const { error } = await sb.from("bug_ia").insert({
    phone: body.phone?.trim() || null,
    stage: body.stage || null,
    descricao: body.descricao?.trim() || null,
  });

  if (error) return NextResponse.json({ error: "Erro ao salvar bug" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const auth = req.cookies.get("auth");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const sb = getSb();
  const { error } = await sb.from("bug_ia")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: "Erro ao resolver bug" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

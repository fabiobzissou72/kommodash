import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSb() {
  return createClient(process.env.N8N_SUPABASE_URL!, process.env.N8N_SUPABASE_KEY!);
}

export async function GET(req: NextRequest) {
  if (!req.cookies.get("auth")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = getSb();
  const { data, error } = await sb.from("feriados_locais").select("*").order("data");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  if (!req.cookies.get("auth")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: body, nome } = await req.json();
  const sb = getSb();
  const { error } = await sb.from("feriados_locais").insert({ data: body, nome });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!req.cookies.get("auth")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  const sb = getSb();
  const { error } = await sb.from("feriados_locais").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

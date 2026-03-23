import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function checkAuth(req: NextRequest) {
  const auth = req.cookies.get("auth");
  return auth?.value?.trim() ? auth.value : null;
}

function sanitizeSubdomain(raw: string): string | null {
  const cleaned = String(raw)
    .replace(/^https?:\/\//, "")
    .replace(/\.kommo\.com.*$/, "")
    .trim()
    .toLowerCase();
  // Apenas letras, números e hífens (formato válido de subdomínio)
  if (!/^[a-z0-9-]{1,63}$/.test(cleaned)) return null;
  return cleaned;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("accounts")
    .select("id, label, subdomain, token")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Erro ao buscar contas" }, { status: 500 });
  return NextResponse.json({ accounts: data || [] });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { label?: string; subdomain?: string; token?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const { label, subdomain, token } = body;
  if (!label || !subdomain || !token) {
    return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  }

  const clean = sanitizeSubdomain(subdomain);
  if (!clean) {
    return NextResponse.json({ error: "Subdomínio inválido" }, { status: 400 });
  }

  const sanitizedLabel = String(label).trim().slice(0, 100);
  const sanitizedToken = String(token).trim().slice(0, 2048);

  const { data, error } = await supabase
    .from("accounts")
    .upsert({ label: sanitizedLabel, subdomain: clean, token: sanitizedToken }, { onConflict: "subdomain" })
    .select("id, label, subdomain, token")
    .single();

  if (error) return NextResponse.json({ error: "Erro ao salvar conta" }, { status: 500 });
  return NextResponse.json({ account: data });
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { subdomain?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const { subdomain } = body;
  if (!subdomain) return NextResponse.json({ error: "Subdomínio obrigatório" }, { status: 400 });

  const clean = sanitizeSubdomain(subdomain);
  if (!clean) return NextResponse.json({ error: "Subdomínio inválido" }, { status: 400 });

  const { error } = await supabase.from("accounts").delete().eq("subdomain", clean);
  if (error) return NextResponse.json({ error: "Erro ao deletar conta" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

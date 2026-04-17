import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
}

function validatePassword(pass: string): string | null {
  if (pass.length < 8) return "Senha deve ter pelo menos 8 caracteres";
  if (!/[A-Z]/.test(pass)) return "Senha deve conter ao menos uma letra maiúscula";
  if (!/[0-9]/.test(pass)) return "Senha deve conter ao menos um número";
  return null;
}

export async function POST(req: NextRequest) {
  let body: { email?: string; invite_code?: string; new_pass?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Requisição inválida" }, { status: 400 });
  }

  const { email, invite_code, new_pass } = body;
  if (!email || !invite_code || !new_pass) {
    return NextResponse.json({ ok: false, error: "Preencha todos os campos" }, { status: 400 });
  }

  if (String(invite_code).trim() !== (process.env.INVITE_CODE ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "Código de convite inválido" }, { status: 403 });
  }

  const passError = validatePassword(String(new_pass));
  if (passError) {
    return NextResponse.json({ ok: false, error: passError }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: user } = await supabase
    .from("dashboard_users")
    .select("id")
    .eq("email", String(email).toLowerCase().trim())
    .single();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Email não encontrado" }, { status: 404 });
  }

  const newHash = await bcrypt.hash(String(new_pass), 12);
  await supabase.from("dashboard_users").update({ password_hash: newHash }).eq("id", user.id);

  return NextResponse.json({ ok: true });
}

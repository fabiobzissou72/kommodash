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
  let body: { name?: string; email?: string; pass?: string; invite_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Requisição inválida" }, { status: 400 });
  }

  const { name, email, pass, invite_code } = body;

  if (String(invite_code).trim() !== (process.env.INVITE_CODE ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "Código de convite inválido" }, { status: 403 });
  }

  if (!name || !email || !pass) {
    return NextResponse.json({ ok: false, error: "Todos os campos são obrigatórios" }, { status: 400 });
  }

  const passError = validatePassword(String(pass));
  if (passError) {
    return NextResponse.json({ ok: false, error: passError }, { status: 400 });
  }

  const sanitizedEmail = String(email).toLowerCase().trim().slice(0, 254);
  const sanitizedName  = String(name).trim().slice(0, 100);

  const password_hash = await bcrypt.hash(String(pass), 12);

  const supabase = getSupabase();
  const { error } = await supabase.from("dashboard_users").insert({
    name: sanitizedName,
    email: sanitizedEmail,
    password_hash,
    role: "viewer",
  });

  if (error) {
    // Não revelar se email já existe — mensagem genérica
    return NextResponse.json(
      { ok: false, error: "Não foi possível criar a conta. Verifique os dados." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const { name, email, pass, invite_code } = await req.json();

  // Código de convite para controlar quem pode se cadastrar
  if (invite_code !== process.env.INVITE_CODE) {
    return NextResponse.json({ ok: false, error: "Código de convite inválido" }, { status: 403 });
  }

  if (!name || !email || !pass) {
    return NextResponse.json({ ok: false, error: "Todos os campos são obrigatórios" }, { status: 400 });
  }

  if (pass.length < 6) {
    return NextResponse.json({ ok: false, error: "Senha deve ter pelo menos 6 caracteres" }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(pass, 10);

  const { error } = await supabase.from("dashboard_users").insert({
    name,
    email: email.toLowerCase().trim(),
    password_hash,
    role: "viewer",
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: false, error: "Email já cadastrado" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

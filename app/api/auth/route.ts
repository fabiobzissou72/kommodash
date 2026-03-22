import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const { email, pass } = await req.json();
  if (!email || !pass) return NextResponse.json({ ok: false, error: "Campos obrigatórios" }, { status: 400 });

  const { data: user } = await supabase
    .from("dashboard_users")
    .select("id, email, name, password_hash, role")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (!user) return NextResponse.json({ ok: false, error: "Email ou senha incorretos" }, { status: 401 });

  const valid = await bcrypt.compare(pass, user.password_hash);
  if (!valid) return NextResponse.json({ ok: false, error: "Email ou senha incorretos" }, { status: 401 });

  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set("auth", user.id, { httpOnly: true, maxAge: 60 * 60 * 24 * 7, path: "/" });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("auth");
  return res;
}

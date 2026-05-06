import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Rate limiting simples em memória (por IP)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function resetAttempts(ip: string) {
  loginAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Muitas tentativas. Tente novamente em 15 minutos." },
      { status: 429 }
    );
  }

  let body: { email?: string; pass?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Requisição inválida" }, { status: 400 });
  }

  const { email, pass } = body;
  if (!email || !pass) {
    return NextResponse.json({ ok: false, error: "Campos obrigatórios" }, { status: 400 });
  }

  const sanitizedEmail = String(email).toLowerCase().trim().slice(0, 254);

  const supabase = getSupabase();
  const { data: user } = await supabase
    .from("dashboard_users")
    .select("id, email, name, password_hash, role")
    .eq("email", sanitizedEmail)
    .single();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Email ou senha incorretos" }, { status: 401 });
  }

  const valid = await bcrypt.compare(String(pass), user.password_hash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "Email ou senha incorretos" }, { status: 401 });
  }

  resetAttempts(ip);

  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set("auth", user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("auth", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}

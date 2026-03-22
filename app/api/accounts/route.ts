import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function checkAuth(req: NextRequest) {
  return req.cookies.get("auth");
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("accounts")
    .select("id, label, subdomain, token")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data || [] });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { label, subdomain, token } = await req.json();
  if (!label || !subdomain || !token) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const clean = subdomain.replace(/^https?:\/\//, "").replace(/\.kommo\.com.*$/, "").trim();

  const { data, error } = await supabase
    .from("accounts")
    .upsert({ label, subdomain: clean, token }, { onConflict: "subdomain" })
    .select("id, label, subdomain, token")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subdomain } = await req.json();
  if (!subdomain) return NextResponse.json({ error: "Missing subdomain" }, { status: 400 });

  const { error } = await supabase.from("accounts").delete().eq("subdomain", subdomain);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

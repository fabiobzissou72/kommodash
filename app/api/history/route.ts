import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const auth = req.cookies.get("auth");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subdomain, pipeline_id } = await req.json();
  if (!subdomain || !pipeline_id) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("kommo_snapshots")
    .select("snapshot_date, today_leads, today_won, today_lost, total_active, total_won, total_lost, funnel")
    .eq("account_subdomain", subdomain)
    .eq("pipeline_id", pipeline_id)
    .order("snapshot_date", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ history: data || [] });
}

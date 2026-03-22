import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

async function kommoGet(subdomain: string, token: string, path: string) {
  const res = await axios.get(`https://${subdomain}.kommo.com/api/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (s) => s < 500,
  });
  return res.data || {};
}

export async function POST(req: NextRequest) {
  const auth = req.cookies.get("auth");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subdomain, token, pipeline_id, query } = await req.json();
  if (!subdomain || !token) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const clean = subdomain.replace(/^https?:\/\//, "").replace(/\.kommo\.com.*$/, "").trim();

  // Busca statuses para mapear nome da etapa
  const pipelineData = await kommoGet(clean, token, `/leads/pipelines/${pipeline_id}`);
  const statuses: Record<number, string> = {};
  (pipelineData._embedded?.statuses || []).forEach((s: any) => {
    statuses[s.id] = s.name;
  });

  // Busca leads com nome ou query
  const params = new URLSearchParams({ limit: "50" });
  if (pipeline_id) params.set("filter[pipeline_id]", pipeline_id);
  if (query) params.set("query", query);

  const data = await kommoGet(clean, token, `/leads?${params}`);
  const leads = (data._embedded?.leads || []).map((l: any) => ({
    id: l.id,
    name: l.name || `Lead #${l.id}`,
    stage: statuses[l.status_id] || "Desconhecido",
    price: l.price || 0,
    created_at: l.created_at,
  }));

  return NextResponse.json({ leads });
}

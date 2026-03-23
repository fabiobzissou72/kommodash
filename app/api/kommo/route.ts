import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

type LeadRaw = {
  id: number;
  name: string;
  price: number;
  status_id: number;
  pipeline_id: number;
  responsible_user_id: number;
  created_at: number;
  closed_at?: number;
  updated_at: number;
};

type TaskRaw = {
  id: number;
  text: string;
  complete_till: number;
  element_id: number;
  element_type: number;
  responsible_user_id: number;
};

async function kommoFetch(subdomain: string, token: string, path: string) {
  const res = await axios.get(`https://${subdomain}.kommo.com/api/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (s) => s < 500,
    timeout: 15000,
  });
  if (res.status === 401) throw new Error("Token inválido (401)");
  if (res.status === 429) throw new Error("Rate limit Kommo — tente em 1 minuto");
  if (!res.data || res.status === 204) return {};
  return res.data;
}

async function kommoFetchLeads(
  subdomain: string, token: string, path: string, maxPages = 5
): Promise<{ count: number; value: number; leads: LeadRaw[] }> {
  let page = 1;
  let total = 0;
  let totalValue = 0;
  const allLeads: LeadRaw[] = [];
  while (page <= maxPages) {
    const sep = path.includes("?") ? "&" : "?";
    const d = await kommoFetch(subdomain, token, `${path}${sep}limit=250&page=${page}`);
    const leads: LeadRaw[] = d._embedded?.leads || [];
    total += leads.length;
    totalValue += leads.reduce((s, l) => s + (l.price || 0), 0);
    allLeads.push(...leads);
    if (leads.length < 250) break;
    page++;
    await delay(200);
  }
  return { count: total, value: totalValue, leads: allLeads };
}

function now() { return Math.floor(Date.now() / 1000); }
function startOfDay(daysAgo = 0) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}
function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}
function startOfMonth() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}
function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export async function POST(req: NextRequest) {
  const auth = req.cookies.get("auth");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { subdomain?: string; token?: string; pipeline_id?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const { subdomain: raw, token, pipeline_id: rawPid } = body;
  if (!raw || !token) return NextResponse.json({ error: "Credenciais obrigatórias" }, { status: 400 });

  const subdomain = String(raw).replace(/^https?:\/\//, "").replace(/\.kommo\.com.*$/, "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,63}$/.test(subdomain)) {
    return NextResponse.json({ error: "Subdomínio inválido" }, { status: 400 });
  }

  const safeToken = String(token).trim().slice(0, 2048);
  const pipeline_id = rawPid != null && Number.isFinite(Number(rawPid)) && Number(rawPid) > 0
    ? Math.floor(Number(rawPid))
    : null;

  try {
    const ts = now();
    const todayTs   = startOfDay();
    const weekTs    = startOfWeek();
    const monthTs   = startOfMonth();
    const yesterdayFrom = startOfDay(1);
    const yesterdayTo   = startOfDay(0);

    // === LOTE 1: Pipeline + Usuários ===
    const [pipelinesRes, usersRes] = await Promise.all([
      kommoFetch(subdomain, safeToken, "/leads/pipelines"),
      kommoFetch(subdomain, safeToken, "/users?limit=250").catch(() => ({})),
    ]);

    const pipelines: { id: number; name: string; _embedded?: { statuses: { id: number; name: string }[] } }[] =
      pipelinesRes._embedded?.pipelines || [];
    let pid = pipeline_id;
    if (!pid && pipelines.length > 0) pid = pipelines[0].id;
    const pipeline = pipelines.find(p => p.id === pid) || pipelines[0];
    const statuses = (pipeline?._embedded?.statuses || []).filter((s: { id: number }) => s.id !== 142 && s.id !== 143);

    const userMap: Record<number, string> = {};
    const usersList: { id: number; name: string }[] = usersRes._embedded?.users || [];
    usersList.forEach(u => { userMap[u.id] = u.name; });

    await delay(150);

    // === LOTE 2: Período atual (sequencial para evitar rate limit) ===
    const todayRes = await kommoFetch(subdomain, safeToken,
      `/leads?filter[created_at][from]=${todayTs}&filter[created_at][to]=${ts}&limit=250`);
    await delay(150);

    const weekRes = await kommoFetch(subdomain, safeToken,
      `/leads?filter[created_at][from]=${weekTs}&filter[created_at][to]=${ts}&limit=250`);
    await delay(150);

    const monthRes = await kommoFetch(subdomain, safeToken,
      `/leads?filter[created_at][from]=${monthTs}&filter[created_at][to]=${ts}&limit=250`);
    await delay(150);

    const wonTodayRes = await kommoFetch(subdomain, safeToken,
      `/leads?filter[closed_at][from]=${todayTs}&filter[closed_at][to]=${ts}&filter[statuses][0][pipeline_id]=${pid}&filter[statuses][0][status_id]=142&limit=250`);
    await delay(150);

    const lostTodayRes = await kommoFetch(subdomain, safeToken,
      `/leads?filter[closed_at][from]=${todayTs}&filter[closed_at][to]=${ts}&filter[statuses][0][pipeline_id]=${pid}&filter[statuses][0][status_id]=143&limit=250`);
    await delay(150);

    const wonAllData = await kommoFetchLeads(subdomain, safeToken,
      `/leads?filter[statuses][0][pipeline_id]=${pid}&filter[statuses][0][status_id]=142`);
    await delay(150);

    const { count: lostCountPaginated } = await kommoFetchLeads(subdomain, safeToken,
      `/leads?filter[statuses][0][pipeline_id]=${pid}&filter[statuses][0][status_id]=143`);
    await delay(150);

    const tasksRes = await kommoFetch(subdomain, safeToken,
      `/tasks?filter[is_completed]=0&filter[till][to]=${ts}&limit=250`).catch(() => ({}));
    await delay(200);

    // === LOTE 2b: Ontem + Contatos + Atividade + Tarefas completas ===
    const [
      yesterdayLeadsRes,
      wonYesterdayRes,
      lostYesterdayRes,
      contactsTodayRes,
      recentActivityRes,
      tasksFullRes,
      contactsWeekRes,
    ] = await Promise.all([
      kommoFetch(subdomain, safeToken, `/leads?filter[created_at][from]=${yesterdayFrom}&filter[created_at][to]=${yesterdayTo}&limit=250`).catch(() => ({})),
      kommoFetch(subdomain, safeToken, `/leads?filter[closed_at][from]=${yesterdayFrom}&filter[closed_at][to]=${yesterdayTo}&filter[statuses][0][pipeline_id]=${pid}&filter[statuses][0][status_id]=142&limit=250`).catch(() => ({})),
      kommoFetch(subdomain, safeToken, `/leads?filter[closed_at][from]=${yesterdayFrom}&filter[closed_at][to]=${yesterdayTo}&filter[statuses][0][pipeline_id]=${pid}&filter[statuses][0][status_id]=143&limit=250`).catch(() => ({})),
      kommoFetch(subdomain, safeToken, `/contacts?filter[created_at][from]=${todayTs}&limit=250`).catch(() => ({})),
      kommoFetch(subdomain, safeToken, `/leads?order[updated_at]=desc&filter[statuses][0][pipeline_id]=${pid}&limit=20`).catch(() => ({})),
      kommoFetch(subdomain, safeToken, `/tasks?filter[is_completed]=0&limit=50`).catch(() => ({})),
      kommoFetch(subdomain, safeToken, `/contacts?filter[created_at][from]=${weekTs}&limit=250`).catch(() => ({})),
    ]);

    const todayLeads: LeadRaw[]     = todayRes._embedded?.leads || [];
    const wonTodayLeads: LeadRaw[]  = wonTodayRes._embedded?.leads || [];
    const lostTodayLeads: LeadRaw[] = lostTodayRes._embedded?.leads || [];
    const wonAllLeads: LeadRaw[]    = wonAllData.leads;
    const overdueTasks              = (tasksRes as any)._embedded?.tasks || [];

    const yesterdayLeadsCount = (yesterdayLeadsRes as any)._embedded?.leads?.length || 0;
    const yesterdayWonCount   = (wonYesterdayRes as any)._embedded?.leads?.length || 0;
    const yesterdayLostCount  = (lostYesterdayRes as any)._embedded?.leads?.length || 0;
    const contactsToday       = (contactsTodayRes as any)._embedded?.contacts?.length || 0;
    const contactsWeek        = (contactsWeekRes as any)._embedded?.contacts?.length || 0;
    const recentActivityRaw: LeadRaw[] = (recentActivityRes as any)._embedded?.leads || [];
    const tasksFullList: TaskRaw[]     = (tasksFullRes as any)._embedded?.tasks || [];

    const revenueToday = wonTodayLeads.reduce((s, l) => s + (l.price || 0), 0);
    const wonAllValue  = wonAllData.value;
    const wonCount     = wonAllData.count;
    const lostCount    = lostCountPaginated;
    const avgTicket    = wonCount > 0 ? Math.round(wonAllValue / wonCount) : 0;
    const convRate     = (wonCount + lostCount) > 0
      ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;

    const wonWithClose = wonAllLeads.filter(l => l.closed_at && l.created_at);
    const avgCloseHours = wonWithClose.length > 0
      ? Math.round(wonWithClose.reduce((s, l) => s + ((l.closed_at! - l.created_at) / 3600), 0) / wonWithClose.length)
      : 0;

    const hourlyMap: Record<string, number> = {};
    for (let h = 0; h < 24; h++) hourlyMap[String(h).padStart(2, "0") + "h"] = 0;
    todayLeads.forEach(l => {
      if (!l.created_at) return;
      const h = new Date(l.created_at * 1000).getHours();
      hourlyMap[String(h).padStart(2, "0") + "h"]++;
    });
    const hourly = Object.entries(hourlyMap).map(([hour, count]) => ({ hour, count }));

    // === LOTE 3: Funil por etapa ===
    const funnel: { name: string; count: number; value: number; rate: number }[] = [];
    const allFunnelLeads: LeadRaw[] = [];

    for (const s of statuses as { id: number; name: string }[]) {
      try {
        const { count, value, leads } = await kommoFetchLeads(subdomain, safeToken,
          `/leads?filter[statuses][0][pipeline_id]=${pid}&filter[statuses][0][status_id]=${s.id}`);
        funnel.push({ name: s.name, count, value, rate: 0 });
        allFunnelLeads.push(...leads);
      } catch {
        funnel.push({ name: s.name, count: 0, value: 0, rate: 0 });
      }
      await delay(200);
    }

    const firstCount = funnel[0]?.count || 1;
    funnel.forEach(f => {
      f.rate = firstCount > 0 ? Math.round((f.count / firstCount) * 100) : 0;
    });

    // Top leads por valor
    const topLeads = [...allFunnelLeads]
      .filter(l => l.price > 0)
      .sort((a, b) => b.price - a.price)
      .slice(0, 10)
      .map(l => ({
        id: l.id,
        name: l.name || `Lead #${l.id}`,
        price: l.price,
        stage: (statuses as { id: number; name: string }[]).find(s => s.id === l.status_id)?.name || "—",
        responsible: userMap[l.responsible_user_id] || `User ${l.responsible_user_id}`,
      }));

    // Ranking vendedores
    const activeRankMap: Record<number, { name: string; won: number; active: number }> = {};
    wonAllLeads.forEach(l => {
      const uid = l.responsible_user_id;
      if (!activeRankMap[uid]) activeRankMap[uid] = { name: userMap[uid] || `User ${uid}`, won: 0, active: 0 };
      activeRankMap[uid].won++;
    });
    allFunnelLeads.forEach(l => {
      const uid = l.responsible_user_id;
      if (!activeRankMap[uid]) activeRankMap[uid] = { name: userMap[uid] || `User ${uid}`, won: 0, active: 0 };
      activeRankMap[uid].active++;
    });
    const fullRanking = Object.values(activeRankMap)
      .sort((a, b) => b.won - a.won || b.active - a.active)
      .slice(0, 10);

    // Hot leads (maior valor + mais recentemente atualizados)
    const hotLeads = [...allFunnelLeads]
      .filter(l => l.price > 0)
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, 10)
      .map(l => ({
        id: l.id,
        name: l.name || `Lead #${l.id}`,
        price: l.price,
        stage: (statuses as { id: number; name: string }[]).find(s => s.id === l.status_id)?.name || "—",
        responsible: userMap[l.responsible_user_id] || `User ${l.responsible_user_id}`,
        updated_ago: timeAgo(l.updated_at),
      }));

    // Atividade recente (leads atualizados recentemente no pipeline)
    const allLeadsByPipeline = allFunnelLeads;
    const recentActivity = recentActivityRaw
      .map(l => ({
        id: l.id,
        name: l.name || `Lead #${l.id}`,
        price: l.price || 0,
        stage: (statuses as { id: number; name: string }[]).find(s => s.id === l.status_id)?.name || "—",
        responsible: userMap[l.responsible_user_id] || `User ${l.responsible_user_id}`,
        updated_ago: timeAgo(l.updated_at),
      }));

    // Tarefas com nome do lead
    const allLeadsForTasks = [...allFunnelLeads, ...wonAllLeads];
    const tasksList = tasksFullList
      .map(t => {
        const leadObj = allLeadsForTasks.find(l => l.id === t.element_id);
        return {
          id: t.id,
          text: t.text || "Tarefa",
          complete_till: t.complete_till,
          lead_id: t.element_id,
          lead_name: leadObj?.name || (t.element_id ? `Lead #${t.element_id}` : "—"),
          responsible: userMap[t.responsible_user_id] || `User ${t.responsible_user_id}`,
          overdue: t.complete_till > 0 && t.complete_till < ts,
        };
      })
      .sort((a, b) => a.complete_till - b.complete_till)
      .slice(0, 25);

    // Distribuição por responsável nos leads ativos
    const activeByUser: { name: string; count: number; value: number }[] = Object.entries(
      allFunnelLeads.reduce((acc, l) => {
        const uid = l.responsible_user_id;
        const name = userMap[uid] || `User ${uid}`;
        if (!acc[uid]) acc[uid] = { name, count: 0, value: 0 };
        acc[uid].count++;
        acc[uid].value += l.price || 0;
        return acc;
      }, {} as Record<number, { name: string; count: number; value: number }>)
    )
      .map(([, v]) => v)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // === LOTE 4: Histórico 30 dias ===
    const daily: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const from  = startOfDay(i);
      const to    = i === 0 ? ts : startOfDay(i - 1);
      const label = new Date(from * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      try {
        const d = await kommoFetch(subdomain, safeToken,
          `/leads?filter[created_at][from]=${from}&filter[created_at][to]=${to}&limit=250`);
        const leads: unknown[] = d._embedded?.leads || [];
        daily.push({ date: label, count: leads.length });
      } catch {
        daily.push({ date: label, count: 0 });
      }
      await delay(150);
    }

    const activeCount = funnel.reduce((s, f) => s + f.count, 0);
    const activeValue = funnel.reduce((s, f) => s + f.value, 0);

    // Revenue won week
    const revenueWonWeek = wonAllLeads
      .filter(l => l.closed_at && l.closed_at >= weekTs)
      .reduce((s, l) => s + (l.price || 0), 0);

    // Revenue won month
    const revenueWonMonth = wonAllLeads
      .filter(l => l.closed_at && l.closed_at >= monthTs)
      .reduce((s, l) => s + (l.price || 0), 0);

    const result = {
      pipeline: { id: pid, name: pipeline?.name || "" },
      pipelines: pipelines.map(p => ({ id: p.id, name: p.name })),
      today: {
        leads:   todayLeads.length,
        won:     wonTodayLeads.length,
        lost:    lostTodayLeads.length,
        revenue: revenueToday,
      },
      yesterday: {
        leads: yesterdayLeadsCount,
        won:   yesterdayWonCount,
        lost:  yesterdayLostCount,
      },
      week:  {
        leads: (weekRes._embedded?.leads || []).length,
        revenue: revenueWonWeek,
      },
      month: {
        leads: (monthRes._embedded?.leads || []).length,
        revenue: revenueWonMonth,
      },
      contacts: {
        today: contactsToday,
        week:  contactsWeek,
      },
      funnel,
      daily,
      hourly,
      totals: { won: wonCount, lost: lostCount, active: activeCount, active_value: activeValue, won_value: wonAllValue },
      conversion_rate: convRate,
      avg_ticket: avgTicket,
      avg_close_hours: avgCloseHours,
      overdue_tasks: overdueTasks.length,
      ranking: fullRanking,
      top_leads: topLeads,
      hot_leads: hotLeads,
      recent_activity: recentActivity,
      tasks_list: tasksList,
      active_by_user: activeByUser,
    };

    // Snapshot Supabase
    const brDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split("T")[0];
    getSupabase().from("kommo_snapshots").upsert({
      account_subdomain: subdomain,
      pipeline_id: pid,
      pipeline_name: pipeline?.name || "",
      snapshot_date: brDate,
      today_leads: result.today.leads,
      today_won: result.today.won,
      today_lost: result.today.lost,
      total_active: activeCount,
      total_won: wonCount,
      total_lost: lostCount,
      funnel,
    }, { onConflict: "account_subdomain,pipeline_id,snapshot_date" }).then(() => {});

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

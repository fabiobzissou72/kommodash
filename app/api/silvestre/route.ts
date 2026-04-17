import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const RD_TOKEN = "69cacc672fdda900130b9074";
const RD_BASE = "https://crm.rdstation.com/api/v1";
const PIPELINE_FUP = "69cab6d0f9efe6001ae97e70";
const PIPELINE_PACIENTES = "69cac118c640ee001964801b";
const STAGE_LEADS_QUENTES = "69d54cdbfffb4c0013c8b27b";
const STAGE_AG_PAGAMENTO = "69d67b0b154f0f001672972e";

function getSb() {
  return createClient(process.env.N8N_SUPABASE_URL!, process.env.N8N_SUPABASE_KEY!);
}

async function rdFetch(path: string): Promise<any> {
  try {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${RD_BASE}${path}${sep}token=${RD_TOKEN}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function getRdDealsByStage(stageId: string): Promise<any[]> {
  const deals: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 10) {
    const d = await rdFetch(`/deals?deal_stage_id=${stageId}&limit=200&page=${page}`);
    if (!d || !Array.isArray(d.deals)) break;
    deals.push(...d.deals);
    hasMore = d.has_more || false;
    page++;
  }
  return deals;
}

async function getAllRdDeals(pipelineId: string): Promise<any[]> {
  const deals: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 20) {
    const d = await rdFetch(`/deals?deal_pipeline_id=${pipelineId}&limit=200&page=${page}`);
    if (!d || !Array.isArray(d.deals)) break;
    deals.push(...d.deals);
    hasMore = d.has_more || false;
    page++;
  }
  return deals;
}

// Cálculo da Páscoa (algoritmo de Butcher)
function getEaster(year: number): Date {
  const a = year % 19, b = Math.floor(year/100), c = year % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4;
  const l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  const month = Math.floor((h+l-7*m+114)/31);
  const day = ((h+l-7*m+114) % 31) + 1;
  return new Date(year, month-1, day);
}

// Feriados nacionais brasileiros para um ano
function getFeriados(year: number): Set<string> {
  const fmt = (d: Date) => d.toISOString().slice(0,10);
  const fix = (m: number, d: number) => fmt(new Date(year, m-1, d));

  const pascoa = getEaster(year);
  const addDays = (d: Date, n: number) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };

  return new Set([
    fix(1,1),   // Confraternização Universal
    fmt(addDays(pascoa,-48)), // Segunda de Carnaval
    fmt(addDays(pascoa,-47)), // Terça de Carnaval
    fmt(addDays(pascoa,-2)),  // Sexta-feira Santa
    fmt(pascoa),              // Páscoa
    fix(4,21),  // Tiradentes
    fix(5,1),   // Dia do Trabalho
    fmt(addDays(pascoa,60)),  // Corpus Christi
    fix(9,7),   // Independência
    fix(10,12), // Nossa Senhora Aparecida
    fix(11,2),  // Finados
    fix(11,15), // Proclamação da República
    fix(11,20), // Consciência Negra
    fix(12,25), // Natal
  ]);
}

function startOfDay(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonth(): string {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function dateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthLabel(monthsAgo: number): { key: string; label: string } {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return {
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
  };
}

export async function GET(req: NextRequest) {
  const auth = req.cookies.get("auth");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const dateFrom = url.searchParams.get("date_from") || "";
  const dateTo = url.searchParams.get("date_to") || "";

  try {
    const sb = getSb();

    const todayStr = startOfDay(0);
    const weekStr = startOfWeek();
    const hasFilter = !!(dateFrom || dateTo);
    const periodStart = dateFrom ? `${dateFrom}T00:00:00.000Z` : startOfMonth();
    const periodEnd = dateTo ? `${dateTo}T23:59:59.999Z` : new Date().toISOString();
    const chartStart = dateFrom ? `${dateFrom}T00:00:00.000Z` : startOfDay(30);

    // Supabase queries em paralelo
    const [
      { count: totalLeads },
      { count: leadsHoje },
      { count: leadsSemana },
      { count: leadsMes },
      { data: leadsLast30 },
      { data: convStages },
      { data: fupTracking },
      { data: humanosData },
      { data: bugsData },
      { data: messagesData },
      { data: feriadosLocaisData },
    ] = await Promise.all([
      sb.from("dados_cliente").select("*", { count: "exact", head: true }),
      sb.from("dados_cliente").select("*", { count: "exact", head: true }).gte("created_at", todayStr),
      sb.from("dados_cliente").select("*", { count: "exact", head: true }).gte("created_at", weekStr),
      sb.from("dados_cliente").select("*", { count: "exact", head: true }).gte("created_at", periodStart).lte("created_at", periodEnd),
      sb.from("dados_cliente").select("created_at").gte("created_at", chartStart).lte("created_at", periodEnd),
      sb.from("nsf_conversations").select("phone, current_stage, created_at, updated_at"),
      hasFilter
        ? sb.from("follow_up_tracking").select("status, follow_up_count").gte("created_at", periodStart).lte("created_at", periodEnd)
        : sb.from("follow_up_tracking").select("status, follow_up_count"),
      sb.from("dados_cliente").select("telefone").eq("humano", true),
      sb.from("bug_ia").select("id, created_at, stage, resolved").order("created_at", { ascending: false }),
      sb.from("nsf_messages").select("phone, role, stage, created_at").gte("created_at", startOfDay(30)).order("phone").order("created_at", { ascending: true }),
      sb.from("feriados_locais").select("data"),
    ]);

    // Tempo médio da IA: primeira msg do lead (stage 1) → última msg "ai" no stage 6
    let tempoMedioResposta = 0;
    if (messagesData && messagesData.length > 0) {
      const diffs: number[] = [];
      // Agrupar por phone
      const byPhone: Record<string, { role: string; stage: number; created_at: string }[]> = {};
      (messagesData as any[]).forEach((m) => {
        if (!byPhone[m.phone]) byPhone[m.phone] = [];
        byPhone[m.phone].push({ role: m.role, stage: Number(m.stage) || 1, created_at: m.created_at });
      });
      Object.values(byPhone).forEach((msgs) => {
        // Stage fica nas msgs do cliente (não na IA que tem stage=null)
        // Procura a última mensagem do cliente no stage 6
        const lastStage6 = [...msgs].reverse().find(m => m.stage === 6);
        if (!lastStage6) return;
        const firstMsg = msgs[0];
        const diffMs = new Date(lastStage6.created_at).getTime() - new Date(firstMsg.created_at).getTime();
        // Ignora negativos ou conversas > 4h (outliers)
        if (diffMs > 0 && diffMs < 14_400_000) diffs.push(diffMs);
      });
      if (diffs.length > 0) {
        const avgMs = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        tempoMedioResposta = Math.round(avgMs / 60_000); // em minutos
      }
    }

    // Stage distribution
    const stageMap: Record<number, number> = {};
    (convStages || []).forEach((c: any) => {
      const s = Number(c.current_stage) || 1;
      stageMap[s] = (stageMap[s] || 0) + 1;
    });

    // Respondidos hoje (ou no período filtrado)
    const respondidoHoje = (convStages || []).filter((c: any) => {
      if (Number(c.current_stage) !== 102) return false;
      const upd = c.updated_at || c.created_at || "";
      if (hasFilter) return upd >= periodStart && upd <= periodEnd;
      return upd >= todayStr;
    }).length;

    const totalConvs = convStages?.length || 0;

    // Mapa de stage por telefone (para cruzar com humano=true)
    const stageByPhone: Record<string, number> = {};
    (convStages || []).forEach((c: any) => {
      if (c.phone) stageByPhone[c.phone] = Number(c.current_stage) || 1;
    });

    // Humano real: dados_cliente.humano=true excluindo stages 100/101/102
    const humanosPhones = (humanosData || []).map((r: any) => r.telefone);
    const countHumanoReal = humanosPhones.filter((tel: string) => {
      const s = stageByPhone[tel];
      return s === undefined || (s !== 100 && s !== 101 && s !== 102);
    }).length;


    // Leads por dia - últimos 30d
    const dayCount: Record<string, number> = {};
    (leadsLast30 || []).forEach((l: any) => {
      if (l.created_at) {
        const key = dateKey(l.created_at);
        dayCount[key] = (dayCount[key] || 0) + 1;
      }
    });
    const leadsPorDia: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = dateKey(d.toISOString());
      const label = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
      leadsPorDia.push({ date: label, count: dayCount[key] || 0 });
    }

    // IA metrics
    const stageOrder = [1, 2, 3, 4, 5, 6, 99];
    const stageNames: Record<number, string> = {
      1: "Apresentação", 2: "Diagnóstico", 3: "Espelhamento",
      4: "Planos e Valores", 5: "Fechamento", 6: "Concluído", 99: "Humano",
    };

    const iaAbandonoPorEtapa = stageOrder.map((stage, i) => {
      const chegaram = (convStages || []).filter((c: any) => (Number(c.current_stage)||1) >= stage).length;
      const prev = i > 0
        ? (convStages || []).filter((c: any) => (Number(c.current_stage)||1) >= stageOrder[i-1]).length
        : chegaram;
      return { etapa: stageNames[stage], chegaram, abandonaram: Math.max(0, prev - chegaram) };
    });

    const reachedStage6 = (convStages||[]).filter((c:any)=>(Number(c.current_stage)||0)>=6).length;
    const reachedHumano = (convStages||[]).filter((c:any)=>(Number(c.current_stage)||0)===99 || (Number(c.current_stage)||0)>=99).length;
    const iaTaxaConclusao = totalConvs > 0 ? Math.round((reachedStage6/totalConvs)*100) : 0;
    const iaHandoffHumano = totalConvs > 0 ? Math.round((reachedHumano/totalConvs)*100) : 0;

    // RD Station em paralelo
    const [fupDeals, pacientesDeals, leadsQuentesDeals, agPagamentoDeals] = await Promise.all([
      getAllRdDeals(PIPELINE_FUP),
      getAllRdDeals(PIPELINE_PACIENTES),
      getRdDealsByStage(STAGE_LEADS_QUENTES),
      getRdDealsByStage(STAGE_AG_PAGAMENTO),
    ]);

    // Funil de atendimento
    const funnelEtapas = [
      { name: "Contato Inicial", count: stageMap[1] || 0 },
      { name: "IA Respondeu", count: stageMap[1] || 0 },
      { name: "IA Concluiu", count: stageMap[6] || 0 },
      { name: "Humano", count: stageMap[6] || 0 },
      { name: "Lead Quente", count: leadsQuentesDeals.length },
      { name: "Ag. Pagamento", count: agPagamentoDeals.length },
      { name: "Respondido", count: respondidoHoje },
    ];

    // FUP stats da tabela follow_up_tracking
    const fupTrackingAll = fupTracking || [];
    const fupTrackingTotal = fupTrackingAll.length;
    const fupRespondidos = fupTrackingAll.filter((r:any)=>r.status==="responded").length;
    const fupTaxaReengajamento = fupTrackingTotal > 0 ? Math.round((fupRespondidos/fupTrackingTotal)*100) : 0;

    const fupStatsMap: Record<string,{enviados:number;respondidos:number;conversoes:number}> = {};
    for (let i = 1; i <= 7; i++) fupStatsMap[`FUP${i}`] = { enviados: 0, respondidos: 0, conversoes: 0 };
    fupTrackingAll.forEach((r:any) => {
      const n = Number(r.follow_up_count) || 1;
      for (let i = 1; i <= Math.min(n, 7); i++) {
        if (fupStatsMap[`FUP${i}`]) fupStatsMap[`FUP${i}`].enviados++;
      }
      if (r.status === "responded") {
        const key = `FUP${Math.min(n, 7)}`;
        if (fupStatsMap[key]) fupStatsMap[key].respondidos++;
      }
    });
    const fupStats = Object.entries(fupStatsMap).map(([fup,stats]) => ({ fup, ...stats }));

    // Financeiro (RD Station pacientes ativos) — filtra por período se set
    const pacientesFiltered = hasFilter
      ? pacientesDeals.filter((d:any) => {
          if (!d.created_at) return false;
          const dc = d.created_at.slice(0, 10);
          return (!dateFrom || dc >= dateFrom) && (!dateTo || dc <= dateTo);
        })
      : pacientesDeals;

    const fupDealsFiltered = hasFilter
      ? fupDeals.filter((d:any) => {
          if (!d.created_at) return false;
          const dc = d.created_at.slice(0, 10);
          return (!dateFrom || dc >= dateFrom) && (!dateTo || dc <= dateTo);
        })
      : fupDeals;

    let finFaturamentoTotal = 0;
    let finTrimestralCount = 0, finSemestralCount = 0;
    let finTrimestralValor = 0, finSemestralValor = 0;
    const finFatHistMap: Record<string,number> = {};

    pacientesFiltered.forEach((d:any) => {
      const valor = d.amount_total || 0;
      finFaturamentoTotal += valor;

      // Determina plano pelo valor ou campo customizado
      const fields = d.deal_custom_fields || [];
      const planField = fields.find((f:any)=>
        f.custom_field?.label?.toLowerCase().includes("plano") ||
        (f.value||"").toLowerCase().includes("trimestral") ||
        (f.value||"").toLowerCase().includes("semestral")
      );
      const planName = (planField?.value||"").toLowerCase();
      const isTrimestral = planName.includes("trimestral") || (valor > 0 && valor <= 600);
      if (isTrimestral) { finTrimestralCount++; finTrimestralValor += valor; }
      else { finSemestralCount++; finSemestralValor += valor; }

      if (d.created_at) {
        const mk = d.created_at.slice(0, 7);
        finFatHistMap[mk] = (finFatHistMap[mk]||0) + valor;
      }
    });

    const totalPacientes = pacientesFiltered.length;
    const finTicketMedio = totalPacientes > 0 ? Math.round(finFaturamentoTotal/totalPacientes) : 0;
    const finMrr = Math.round(finTrimestralValor/3 + finSemestralValor/6);
    const finLtvTrimestral = finTrimestralCount > 0 ? Math.round(finTrimestralValor/finTrimestralCount) : 497;
    const finLtvSemestral = finSemestralCount > 0 ? Math.round(finSemestralValor/finSemestralCount) : 847;

    // Histórico faturamento 6 meses
    const finFatHistorico = Array.from({length:6},(_,i)=>{
      const { key, label } = monthLabel(5-i);
      return { month: label, value: finFatHistMap[key]||0 };
    });

    // Faturamento por semana — apenas dias úteis (Seg-Sex), mês atual
    const nowDate = new Date();
    const yr = nowDate.getFullYear(), mo = nowDate.getMonth();
    const firstOfMonth = new Date(yr, mo, 1);
    const lastOfMonth = new Date(yr, mo + 1, 0);
    const monthAbrev = nowDate.toLocaleDateString("pt-BR",{month:"short"});
    const pad2 = (n:number) => String(n).padStart(2,"0");
    const feriados = getFeriados(yr);
    const feriadosLocaisSet = new Set<string>((feriadosLocaisData||[]).map((f:any)=>f.data));
    const isUtil = (d:Date) => { const dw=d.getDay(), iso=d.toISOString().slice(0,10); return dw!==0&&dw!==6&&!feriados.has(iso)&&!feriadosLocaisSet.has(iso); };

    // Encontrar a Segunda-feira da semana que contém o dia 1 do mês
    const firstDow = firstOfMonth.getDay(); // 0=dom,1=seg,...
    const mondayOfFirst = new Date(firstOfMonth);
    if (firstDow === 0) mondayOfFirst.setDate(mondayOfFirst.getDate()+1);
    else if (firstDow !== 1) mondayOfFirst.setDate(mondayOfFirst.getDate()-(firstDow-1));

    const finFatSemanal: { label:string; dates:string; start:string; end:string; dias_uteis:number; valor:number }[] = [];
    let totalDiasUteis = 0;
    let curMon = new Date(mondayOfFirst);
    let wkNum = 1;

    while (curMon <= lastOfMonth) {
      const curFri = new Date(curMon); curFri.setDate(curFri.getDate()+4);
      // Clampar ao mês
      const wkS = curMon < firstOfMonth ? new Date(firstOfMonth) : new Date(curMon);
      const wkE = curFri > lastOfMonth ? new Date(lastOfMonth) : new Date(curFri);
      if (wkS > lastOfMonth) break;

      // Contar dias úteis na semana
      let du = 0;
      const dc = new Date(wkS);
      while (dc <= wkE) { if (isUtil(dc)) du++; dc.setDate(dc.getDate()+1); }

      if (du > 0) {
        totalDiasUteis += du;
        const startStr = wkS.toISOString().slice(0,10);
        const endStr = wkE.toISOString().slice(0,10);
        const valor = pacientesDeals
          .filter((d:any)=>{ const dstr=(d.created_at||"").slice(0,10); return dstr>=startStr&&dstr<=endStr; })
          .reduce((s:number,d:any)=>s+(d.amount_total||0),0);
        finFatSemanal.push({
          label: `Sem ${wkNum}`,
          dates: `${pad2(wkS.getDate())} a ${pad2(wkE.getDate())}/${monthAbrev}`,
          start: startStr, end: endStr,
          dias_uteis: du, valor,
        });
        wkNum++;
      }
      // Próxima segunda
      curMon = new Date(curFri); curMon.setDate(curMon.getDate()+3);
    }

    // Dias úteis restantes no mês (de hoje até o fim, excluindo feriados)
    let diasUteisRestantes = 0;
    const todayDate = new Date(); todayDate.setHours(0,0,0,0);
    const scanDay = new Date(todayDate);
    while (scanDay <= lastOfMonth) {
      if (isUtil(scanDay)) diasUteisRestantes++;
      scanDay.setDate(scanDay.getDate()+1);
    }

    const taxaConversao = (totalLeads||0) > 0 ? Math.round((totalPacientes/(totalLeads||1))*100) : 0;
    const vendasHoje = hasFilter
      ? pacientesFiltered.length
      : pacientesDeals.filter((d:any)=>d.created_at>=todayStr.slice(0,10)).length;

    const fupAtivos = fupDealsFiltered.filter((d:any)=>d.deal_stage?.name?.startsWith("FUP")).length;
    const fupExpirados = fupDealsFiltered.filter((d:any)=>d.deal_stage?.name==="NUTRIÇÃO").length;
    const fupTotal = Math.max(fupDealsFiltered.length, fupTrackingTotal);

    return NextResponse.json({
      // Funil
      tempo_medio_resposta: tempoMedioResposta,
      // Bug IA
      bug_total: (bugsData||[]).length,
      bug_abertos: (bugsData||[]).filter((b:any)=>!b.resolved).length,
      bug_resolvidos: (bugsData||[]).filter((b:any)=>b.resolved).length,
      bug_por_dia: (() => {
        const map: Record<string,{abertos:number;resolvidos:number}> = {};
        for (let i=6;i>=0;i--) {
          const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
          const k = d.toISOString().slice(0,10);
          map[k] = {abertos:0,resolvidos:0};
        }
        (bugsData||[]).forEach((b:any)=>{
          const k = (b.created_at||"").slice(0,10);
          if (map[k]) { if(b.resolved) map[k].resolvidos++; else map[k].abertos++; }
        });
        return Object.entries(map).map(([date,v])=>({ date: date.slice(5), ...v }));
      })(),
      leads_hoje: leadsHoje ?? 0,
      leads_semana: leadsSemana ?? 0,
      leads_mes: leadsMes ?? 0,
      vendas_hoje: vendasHoje,
      taxa_conversao: taxaConversao,
      total_leads: totalLeads ?? 0,
      total_conversas: totalConvs,
      funil_etapas: funnelEtapas,
      leads_por_dia: leadsPorDia,
      // IA
      ia_taxa_conclusao: iaTaxaConclusao,
      ia_handoff_humano: iaHandoffHumano,
      ia_abandono_por_etapa: iaAbandonoPorEtapa,
      // Follow-up
      fup_ativos: Math.max(fupAtivos, fupTrackingTotal),
      fup_expirados: fupExpirados,
      fup_total: fupTotal,
      fup_taxa_reengajamento: fupTaxaReengajamento,
      fup_conversoes: 0,
      fup_stats: fupStats,
      // Financeiro
      fin_faturamento_total: finFaturamentoTotal,
      fin_mrr: finMrr,
      fin_ticket_medio: finTicketMedio,
      fin_ltv_trimestral: finLtvTrimestral,
      fin_ltv_semestral: finLtvSemestral,
      fin_trimestral_count: finTrimestralCount,
      fin_semestral_count: finSemestralCount,
      fin_trimestral_valor: finTrimestralValor,
      fin_semestral_valor: finSemestralValor,
      fin_renov_ate_30: 0,
      fin_renov_30_60: 0,
      fin_renov_60_90: 0,
      fin_renov_90_365: 0,
      fin_churn: 0,
      fin_faturamento_historico: finFatHistorico,
      fin_faturamento_semanal: finFatSemanal,
      fin_dias_uteis_mes: totalDiasUteis,
      fin_dias_uteis_restantes: diasUteisRestantes,
      fin_mix_planos: [
        { plano: "Trimestral", count: finTrimestralCount, valor: finTrimestralValor },
        { plano: "Semestral", count: finSemestralCount, valor: finSemestralValor },
      ],
      total_pacientes: totalPacientes,
      leads_quentes: leadsQuentesDeals.length,
      ag_pagamento: agPagamentoDeals.length,
      respondido_hoje: respondidoHoje,
      respondido_total: stageMap[102] || 0,
    });

  } catch (e: any) {
    console.error("silvestre api error:", e);
    return NextResponse.json({ error: e.message || "Erro interno" }, { status: 500 });
  }
}

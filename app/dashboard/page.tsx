"use client";
import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ───────────────────────────────────────────────────
type SilvestreData = {
  // Funil
  leads_hoje: number;
  leads_semana: number;
  leads_mes: number;
  vendas_hoje: number;
  taxa_conversao: number;
  total_leads: number;
  total_conversas: number;
  funil_etapas: { name: string; count: number }[];
  leads_por_dia: { date: string; count: number }[];
  // IA
  ia_taxa_conclusao: number;
  ia_handoff_humano: number;
  ia_abandono_por_etapa: { etapa: string; chegaram: number; abandonaram: number }[];
  // Follow-up
  fup_ativos: number;
  fup_expirados: number;
  fup_total: number;
  fup_taxa_reengajamento: number;
  fup_conversoes: number;
  fup_stats: { fup: string; enviados: number; respondidos: number; conversoes: number }[];
  // Financeiro
  fin_faturamento_total: number;
  fin_mrr: number;
  fin_ticket_medio: number;
  fin_ltv_trimestral: number;
  fin_ltv_semestral: number;
  fin_trimestral_count: number;
  fin_semestral_count: number;
  fin_trimestral_valor: number;
  fin_semestral_valor: number;
  fin_renov_ate_30: number;
  fin_renov_30_60: number;
  fin_renov_60_90: number;
  fin_renov_90_365: number;
  fin_churn: number;
  fin_faturamento_historico: { month: string; value: number }[];
  fin_mix_planos: { plano: string; count: number; valor: number }[];
  total_pacientes: number;
};

// ─── Utils ───────────────────────────────────────────────────
const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
const COLORS = ["#00d9f5","#00e5a0","#fbbf24","#f43f5e","#a78bfa","#fb923c","#34d399","#e879f9","#84cc16","#38bdf8"];
const REFRESH_INTERVAL = 300;

const tooltipStyle = { background:"#0d1420", border:"1px solid #1a2540", borderRadius:8, fontSize:12, color:"#e2e8f0" };
const tooltipItemStyle = { color:"#e2e8f0" };
const tooltipLabelStyle = { color:"#94a3b8", marginBottom:4 };

// ─── Sub-components ──────────────────────────────────────────
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;
  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="w-8 h-8 rounded-lg flex items-center justify-center bg-secondary hover:bg-accent transition-colors text-sm">
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

function StatCard({ label, value, sub, accent = "cyan", icon }: {
  label: string; value: React.ReactNode; sub?: string;
  accent?: "cyan"|"green"|"red"|"yellow"|"purple"|"orange"|"default"; icon?: string;
}) {
  const accentMap = {
    cyan:    { val:"text-cyan-400",    bar:"bg-cyan-400",    bg:"bg-cyan-400/8"    },
    green:   { val:"text-emerald-400", bar:"bg-emerald-400", bg:"bg-emerald-400/8" },
    red:     { val:"text-rose-400",    bar:"bg-rose-400",    bg:"bg-rose-400/8"    },
    yellow:  { val:"text-amber-400",   bar:"bg-amber-400",   bg:"bg-amber-400/8"   },
    purple:  { val:"text-violet-400",  bar:"bg-violet-400",  bg:"bg-violet-400/8"  },
    orange:  { val:"text-orange-400",  bar:"bg-orange-400",  bg:"bg-orange-400/8"  },
    default: { val:"text-foreground",  bar:"bg-primary",     bg:"bg-primary/8"     },
  };
  const a = accentMap[accent];
  return (
    <div className={`relative overflow-hidden rounded-xl border border-border ${a.bg} p-5`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 ${a.bar} opacity-60`} />
      {icon && <span className="text-xl mb-2 block">{icon}</span>}
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-3xl font-bold ${a.val}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
    </div>
  );
}

function PanelCard({ title, children, icon }: { title: string; children: React.ReactNode; icon?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        {icon && <span>{icon}</span>}
        {title}
      </h3>
      {children}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-28 rounded-xl"/>)}</div>
      <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-28 rounded-xl"/>)}</div>
      <div className="grid grid-cols-2 gap-4">{[...Array(2)].map((_,i)=><Skeleton key={i} className="h-72 rounded-xl"/>)}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<SilvestreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"funil"|"ia_qual"|"followup"|"financeiro"|"alertas">("funil");
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [meta, setMeta] = useState(0);
  const [metaInput, setMetaInput] = useState("");
  const [metaSaved, setMetaSaved] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("dash_meta_mensal");
    if (saved && Number(saved) > 0) { setMeta(Number(saved)); setMetaInput(saved); }
  }, []);

  function saveMeta() {
    const v = Number(metaInput.replace(/\D/g,""));
    if (v > 0) {
      setMeta(v);
      localStorage.setItem("dash_meta_mensal", String(v));
      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 2000);
    }
  }

  const fetchData = useCallback(async (df?: string, dt?: string) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (df) params.set("date_from", df);
      if (dt) params.set("date_to", dt);
      const res = await fetch(`/api/silvestre?${params.toString()}`);
      if (res.status === 401) { router.push("/"); return; }
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch { setError("Erro de conexão"); }
    finally { setLoading(false); setCountdown(REFRESH_INTERVAL); }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const interval = setInterval(() => fetchData(dateFrom, dateTo), REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [fetchData, dateFrom, dateTo]);
  useEffect(() => {
    const tick = setInterval(() => setCountdown(c => c <= 1 ? REFRESH_INTERVAL : c - 1), 1000);
    return () => clearInterval(tick);
  }, []);

  async function logout() { await fetch("/api/auth", { method:"DELETE" }); router.push("/"); }

  const convRate = data?.taxa_conversao ?? 0;
  const metaProgress = meta > 0 ? Math.min(100, Math.round(((data?.fin_faturamento_total??0)/meta)*100)) : 0;

  return (
    <div className="min-h-screen bg-background dark:grid-pattern">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/75 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 h-15 flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <span className="text-cyan-400 text-sm font-black">N</span>
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="font-bold text-sm leading-none tracking-tight">Nutri Silvestre</span>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5">Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <div className="hidden sm:flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs text-cyan-400">Atualizando</span>
              </div>
            )}
            {!loading && (
              <span className="text-xs text-muted-foreground hidden sm:block tabular-nums">
                <span className="text-foreground font-medium">{countdown}s</span>
              </span>
            )}
            <button onClick={() => fetchData(dateFrom, dateTo)}
              className="h-8 px-3 rounded-lg text-xs font-medium bg-secondary hover:bg-cyan-500/10 hover:text-cyan-400 border border-border hover:border-cyan-500/30 transition-all">
              ↻ Atualizar
            </button>
            <ThemeToggle />
            <button onClick={logout} className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors">Sair</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 py-5 space-y-5">

        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 text-rose-400 px-5 py-3 text-sm flex items-center gap-2"><span>⚠</span> {error}</div>}

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border overflow-x-auto">
          {([
            { key:"funil",      label:"Funil de Atendimento" },
            { key:"ia_qual",    label:"IA e Qualificação"    },
            { key:"followup",   label:"Follow-up"            },
            { key:"financeiro", label:"Financeiro"           },
            { key:"alertas",    label:"Alertas"              },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${tab===t.key?"border-cyan-400 text-cyan-400":"border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && !data && <LoadingGrid />}

        {/* ════ FUNIL DE ATENDIMENTO ════ */}
        {tab === "funil" && data && (
          <div className="space-y-5">

            {/* Filtro de data */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtrar período</span>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">De</label>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  className="h-8 px-3 rounded-lg text-xs bg-secondary border border-border outline-none focus:border-cyan-500/50 transition-colors" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Até</label>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  className="h-8 px-3 rounded-lg text-xs bg-secondary border border-border outline-none focus:border-cyan-500/50 transition-colors" />
              </div>
              <button onClick={()=>fetchData(dateFrom,dateTo)}
                className="h-8 px-4 rounded-lg text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25 transition-all">
                Aplicar
              </button>
              {(dateFrom||dateTo) && (
                <button onClick={()=>{ setDateFrom(""); setDateTo(""); fetchData(); }}
                  className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-rose-400 border border-border hover:border-rose-500/30 transition-all">
                  Limpar
                </button>
              )}
            </div>

            {/* Row 1 — Leads por período */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Leads hoje" value={data.leads_hoje} accent="cyan" icon="📥" sub="novos contatos hoje" />
              <StatCard label="Esta semana" value={data.leads_semana} accent="purple" icon="📅" sub="desde segunda-feira" />
              <StatCard label={dateFrom ? "No período" : "Este mês"} value={data.leads_mes} accent="orange" icon="📆"
                sub={dateFrom ? `${dateFrom} → ${dateTo||"hoje"}` : "mês atual"} />
            </div>

            {/* Row 2 — KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Vendas hoje" value={data.vendas_hoje} accent="green" icon="💰" sub="pacientes ativos hoje" />

              {/* Taxa de conversão */}
              <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400 to-emerald-400" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Taxa de conversão</p>
                <p className={`text-3xl font-bold mb-3 ${convRate>=70?"text-emerald-400":convRate>=40?"text-amber-400":"text-rose-400"}`}>{convRate.toFixed(1)}%</p>
                <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${convRate>=70?"bg-emerald-400":convRate>=40?"bg-amber-400":"bg-rose-400"}`}
                    style={{ width:`${Math.min(convRate,100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">pacientes / total leads</p>
              </div>

              <StatCard label="Total de leads" value={data.total_leads} accent="default" icon="👥" sub={`${data.total_conversas} conversas ativas`} />
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Volume por etapa */}
              <PanelCard title="Volume por etapa do funil" icon="📊">
                <div className="space-y-2">
                  {[...data.funil_etapas].sort((a,b)=>b.count-a.count).map((stage,i)=>{
                    const maxC = Math.max(...data.funil_etapas.map(f=>f.count),1);
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium truncate max-w-[60%]">{stage.name}</span>
                          <span className="font-bold">{stage.count}</span>
                        </div>
                        <div className="w-full bg-secondary rounded h-7 overflow-hidden">
                          <div className="h-full rounded transition-all flex items-center px-2"
                            style={{ width:`${(stage.count/maxC)*100}%`, background:COLORS[i%COLORS.length] }}>
                            <span className="text-xs font-semibold text-background truncate">{stage.name}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PanelCard>

              {/* Entradas vs Fechamentos */}
              <PanelCard title="Entradas vs Fechamentos" icon="📈">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[
                    { name:"Leads que entraram", value:data.total_leads },
                    { name:"Pacientes ativos", value:data.total_pacientes },
                  ]} margin={{top:5,right:10,left:-10,bottom:5}}>
                    <XAxis dataKey="name" tick={{fontSize:11}} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{fontSize:10}} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="value" radius={[6,6,0,0]} name="Quantidade">
                      <Cell fill="#00d9f5" />
                      <Cell fill="#00e5a0" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </PanelCard>
            </div>

            {/* Funil de conversão sequencial */}
            <PanelCard title="Funil de conversão por etapa" icon="🔽">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.funil_etapas} margin={{top:5,right:10,left:-10,bottom:40}}>
                  <XAxis dataKey="name" tick={{fontSize:10}} stroke="hsl(var(--muted-foreground))" angle={-20} textAnchor="end" interval={0} />
                  <YAxis tick={{fontSize:10}} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                    formatter={(v:number)=>[`${v} leads`,"Leads"]} />
                  <Bar dataKey="count" radius={[6,6,0,0]} name="Leads">
                    {data.funil_etapas.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </PanelCard>

            {/* Leads por dia 30d */}
            <PanelCard title="Leads que entraram — últimos 30 dias" icon="📈">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.leads_por_dia} margin={{top:5,right:10,left:-10,bottom:0}}>
                  <XAxis dataKey="date" tick={{fontSize:9}} stroke="hsl(var(--muted-foreground))"
                    interval={4} />
                  <YAxis tick={{fontSize:10}} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                  <Line type="monotone" dataKey="count" stroke="#00d9f5" strokeWidth={2} dot={false} name="Leads" />
                </LineChart>
              </ResponsiveContainer>
            </PanelCard>

          </div>
        )}

        {/* ════ IA E QUALIFICAÇÃO ════ */}
        {tab === "ia_qual" && data && (
          <div className="space-y-5">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Conclusão da IA" value={`${data.ia_taxa_conclusao}%`}
                accent={data.ia_taxa_conclusao>=60?"green":data.ia_taxa_conclusao>=30?"yellow":"red"}
                icon="🤖" sub="leads que completaram a IA" />
              <StatCard label="Handoff a humano" value={`${data.ia_handoff_humano}%`}
                accent="cyan" icon="🤝" sub="chegaram ao atendimento humano" />
              <StatCard label="Total conversas" value={data.total_conversas}
                accent="purple" icon="💬" sub="no Supabase" />
              <StatCard label="Em humano agora" value={data.funil_etapas.find(e=>e.name==="Humano")?.count??0}
                accent="orange" icon="👤" sub="leads com atendente" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Mapa de abandono por etapa */}
              <PanelCard title="Mapa de abandono por etapa IA" icon="📉">
                <div className="space-y-4">
                  {data.ia_abandono_por_etapa.map((s,i)=>{
                    const maxC = Math.max(...data.ia_abandono_por_etapa.map(x=>x.chegaram),1);
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="font-medium">{s.etapa}</span>
                          <span className="font-bold" style={{color:COLORS[i]}}>{s.chegaram} leads</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{width:`${(s.chegaram/maxC)*100}%`,background:COLORS[i]}} />
                        </div>
                        {s.abandonaram > 0 && (
                          <p className="text-xs text-rose-400 mt-0.5">{s.abandonaram} abandonaram aqui</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </PanelCard>

              {/* Chegaram vs Abandonaram */}
              <PanelCard title="Chegaram vs Abandonaram por etapa" icon="📊">
                {data.ia_abandono_por_etapa.every(d=>d.chegaram===0) ? (
                  <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.ia_abandono_por_etapa} margin={{top:5,right:10,left:-20,bottom:0}}>
                      <XAxis dataKey="etapa" tick={{fontSize:9}} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{fontSize:10}} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                      <Legend wrapperStyle={{fontSize:11}} />
                      <Bar dataKey="chegaram" name="Chegaram" fill="#00d9f5" radius={[4,4,0,0]} />
                      <Bar dataKey="abandonaram" name="Abandonaram" fill="#f43f5e" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </PanelCard>
            </div>

            {/* Distribuição atual por etapa */}
            <PanelCard title="Distribuição atual de leads por etapa" icon="📋">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {data.funil_etapas.map((e,i)=>(
                  <div key={i} className="rounded-lg border border-border bg-secondary/50 p-3 text-center">
                    <p className="text-2xl font-bold" style={{color:COLORS[i%COLORS.length]}}>{e.count}</p>
                    <p className="text-xs text-muted-foreground mt-1">{e.name}</p>
                  </div>
                ))}
              </div>
            </PanelCard>

          </div>
        )}

        {/* ════ FOLLOW-UP ════ */}
        {tab === "followup" && data && (
          <div className="space-y-5">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Leads na cadência" value={data.fup_ativos} accent="cyan" icon="📨" sub="em follow-up ativo" />
              <StatCard label="Taxa de reengajamento" value={`${data.fup_taxa_reengajamento}%`}
                accent={data.fup_taxa_reengajamento>=30?"green":"yellow"} icon="🔄"
                sub="responderam ao menos 1 FUP" />
              <StatCard label="Conversões via FUP" value={data.fup_conversoes} accent="green" icon="🎯" sub="viraram pacientes" />
              <StatCard label="Leads expirados" value={data.fup_expirados} accent="red" icon="⏰" sub="passaram pelo FUP 7" />
            </div>

            {/* Taxa de resposta por FUP */}
            <PanelCard title="Taxa de resposta por mensagem de Follow-up" icon="📊">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.fup_stats.map(s=>({
                  ...s,
                  taxa: s.enviados>0 ? Math.round((s.respondidos/s.enviados)*100) : 0,
                }))} margin={{top:5,right:10,left:-10,bottom:5}}>
                  <XAxis dataKey="fup" tick={{fontSize:11}} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{fontSize:10}} stroke="hsl(var(--muted-foreground))" unit="%" />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                    formatter={(v:number)=>[`${v}%`,"Taxa de resposta"]} />
                  <Bar dataKey="taxa" name="Taxa de resposta %" radius={[6,6,0,0]}>
                    {data.fup_stats.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </PanelCard>

            {/* Tabela desempenho detalhado */}
            <PanelCard title="Desempenho detalhado por mensagem" icon="📋">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Mensagem</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Enviados</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Respondidos</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Taxa</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Conversões</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fup_stats.map((s,i)=>{
                      const taxa = s.enviados>0 ? Math.round((s.respondidos/s.enviados)*100) : 0;
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                          <td className="py-2.5 px-3 font-medium" style={{color:COLORS[i%COLORS.length]}}>{s.fup}</td>
                          <td className="py-2.5 px-3 text-right">{s.enviados}</td>
                          <td className="py-2.5 px-3 text-right">{s.respondidos}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`font-semibold ${taxa>=20?"text-emerald-400":taxa>=10?"text-amber-400":"text-rose-400"}`}>{taxa}%</span>
                          </td>
                          <td className="py-2.5 px-3 text-right">{s.conversoes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PanelCard>

          </div>
        )}

        {/* ════ FINANCEIRO ════ */}
        {tab === "financeiro" && data && (
          <div className="space-y-5">

            {/* Row 1 — principais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Faturamento total" value={BRL(data.fin_faturamento_total)} accent="green" icon="💵" sub="pacientes ativos" />
              <StatCard label="MRR estimado" value={BRL(data.fin_mrr)} accent="cyan" icon="📅" sub="recorrência mensal" />
              <StatCard label="Ticket médio" value={BRL(data.fin_ticket_medio)} accent="purple" icon="🎫" sub="por paciente" />
              <StatCard label="Total pacientes" value={data.total_pacientes} accent="orange" icon="👥" sub="pacientes ativos" />
            </div>

            {/* Row 2 — planos e LTV */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border bg-cyan-400/8 p-5">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-cyan-400 opacity-60 rounded-t-xl" />
                <span className="text-xl mb-2 block">🗓</span>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Plano Trimestral</p>
                <p className="text-2xl font-bold text-cyan-400">{data.fin_trimestral_count}</p>
                <p className="text-xs text-muted-foreground mt-1">{BRL(data.fin_trimestral_valor)}</p>
              </div>
              <div className="rounded-xl border border-border bg-violet-400/8 p-5">
                <span className="text-xl mb-2 block">📆</span>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Plano Semestral</p>
                <p className="text-2xl font-bold text-violet-400">{data.fin_semestral_count}</p>
                <p className="text-xs text-muted-foreground mt-1">{BRL(data.fin_semestral_valor)}</p>
              </div>
              <StatCard label="LTV Trimestral" value={BRL(data.fin_ltv_trimestral)} accent="yellow" icon="💎" sub="valor médio do plano" />
              <StatCard label="LTV Semestral" value={BRL(data.fin_ltv_semestral)} accent="green" icon="💎" sub="valor médio do plano" />
            </div>

            {/* Meta mensal */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">🎯 Meta mensal</h3>
                <div className="flex items-center gap-2">
                  <input value={metaInput} onChange={e=>setMetaInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveMeta()}
                    placeholder="R$ 0" className="h-8 w-32 px-3 rounded-lg text-xs bg-secondary border border-border outline-none focus:border-cyan-500/50" />
                  <button onClick={saveMeta}
                    className="h-8 px-3 rounded-lg text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25 transition-all">
                    {metaSaved ? "✓ Salvo" : "Salvar"}
                  </button>
                </div>
              </div>
              {meta > 0 && (
                <>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-muted-foreground">{BRL(data.fin_faturamento_total)} de {BRL(meta)}</span>
                    <span className={`font-bold ${metaProgress>=100?"text-emerald-400":metaProgress>=60?"text-amber-400":"text-rose-400"}`}>{metaProgress}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${metaProgress>=100?"bg-emerald-400":metaProgress>=60?"bg-amber-400":"bg-rose-400"}`}
                      style={{width:`${Math.min(metaProgress,100)}%`}} />
                  </div>
                  {metaProgress >= 100 && <p className="text-xs text-emerald-400 mt-2 font-medium">Meta batida!</p>}
                  {metaProgress < 100 && (
                    <p className="text-xs text-muted-foreground mt-2">Faltam {BRL(meta-data.fin_faturamento_total)}</p>
                  )}
                </>
              )}
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Evolução faturamento */}
              <PanelCard title="Evolução do faturamento — últimos 6 meses" icon="📈">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.fin_faturamento_historico} margin={{top:5,right:10,left:-10,bottom:5}}>
                    <XAxis dataKey="month" tick={{fontSize:11}} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{fontSize:10}} stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v:number)=>v>=1000?`${(v/1000).toFixed(0)}k`:String(v)} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                      formatter={(v:number)=>[BRL(v),"Faturamento"]} />
                    <Bar dataKey="value" name="Faturamento" radius={[6,6,0,0]}>
                      {data.fin_faturamento_historico.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </PanelCard>

              {/* Mix de planos */}
              <PanelCard title="Mix de planos" icon="🥧">
                {data.fin_mix_planos.every(p=>p.count===0) ? (
                  <p className="text-muted-foreground text-sm text-center py-8">Sem pacientes cadastrados ainda</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="60%" height={180}>
                      <PieChart>
                        <Pie data={data.fin_mix_planos} dataKey="count" nameKey="plano"
                          cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                          {data.fin_mix_planos.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v:number,n:string)=>[`${v} pacientes`,n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-3 flex-1">
                      {data.fin_mix_planos.map((p,i)=>{
                        const total = data.fin_mix_planos.reduce((s,x)=>s+x.count,0);
                        const pct = total>0?Math.round((p.count/total)*100):0;
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{background:COLORS[i]}} />
                                {p.plano}
                              </span>
                              <span className="font-bold" style={{color:COLORS[i]}}>{pct}%</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{p.count} pacientes · {BRL(p.valor)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </PanelCard>
            </div>

            {/* Renovações */}
            <PanelCard title="Renovações por faixa (aguarda campos de data no RD Station)" icon="🔄">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label:"Até 30 dias", value:data.fin_renov_ate_30, color:"text-rose-400" },
                  { label:"30 a 60 dias", value:data.fin_renov_30_60, color:"text-amber-400" },
                  { label:"60 a 90 dias", value:data.fin_renov_60_90, color:"text-yellow-400" },
                  { label:"90 a 365 dias", value:data.fin_renov_90_365, color:"text-emerald-400" },
                ].map((r,i)=>(
                  <div key={i} className="rounded-lg border border-border bg-secondary/50 p-4 text-center">
                    <p className={`text-3xl font-bold ${r.color}`}>{r.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{r.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Para ativar renovações, adicione os campos "Data início" e "Data fim" no RD Station CRM
              </p>
            </PanelCard>

          </div>
        )}

        {/* ════ ALERTAS ════ */}
        {tab === "alertas" && data && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Alertas operacionais</p>

            {/* Leads no estágio humano há muito tempo */}
            {(data.funil_etapas.find(e=>e.name==="Humano")?.count??0) > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-amber-400">Leads aguardando atendimento humano</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {data.funil_etapas.find(e=>e.name==="Humano")?.count} leads estão na fila de atendimento humano.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* FUP ativos */}
            {data.fup_ativos > 0 && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/8 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📨</span>
                  <div>
                    <p className="font-semibold text-cyan-400">Leads em cadência de follow-up</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {data.fup_ativos} leads estão recebendo mensagens de follow-up. Taxa de reengajamento: {data.fup_taxa_reengajamento}%.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Leads quentes */}
            {(data.funil_etapas.find(e=>e.name==="Lead Quente")?.count??0) > 0 && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔥</span>
                  <div>
                    <p className="font-semibold text-rose-400">Leads quentes aguardando ação</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {data.funil_etapas.find(e=>e.name==="Lead Quente")?.count} leads marcados como quentes. Priorize o fechamento!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Ag. pagamento */}
            {(data.funil_etapas.find(e=>e.name==="Ag. Pagamento")?.count??0) > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🧾</span>
                  <div>
                    <p className="font-semibold text-emerald-400">Aguardando comprovante de pagamento</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {data.funil_etapas.find(e=>e.name==="Ag. Pagamento")?.count} leads enviaram pagamento e aguardam confirmação.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Taxa de conversão baixa */}
            {data.taxa_conversao < 10 && data.total_leads > 10 && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📉</span>
                  <div>
                    <p className="font-semibold text-rose-400">Taxa de conversão baixa</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Taxa atual de {data.taxa_conversao}%. Apenas {data.total_pacientes} de {data.total_leads} leads se tornaram pacientes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {data.funil_etapas.every(e=>e.count===0) && data.fup_ativos===0 && data.taxa_conversao>=10 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-8 text-center">
                <span className="text-4xl block mb-3">✅</span>
                <p className="font-semibold text-emerald-400">Tudo operando normalmente</p>
                <p className="text-sm text-muted-foreground mt-1">Nenhum alerta crítico no momento.</p>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

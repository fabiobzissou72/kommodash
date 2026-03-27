"use client";
import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────
type Account = { label: string; subdomain: string; token: string };
type FunnelStage = { name: string; count: number; value: number; rate?: number };
type HotLead = { id: number; name: string; price: number; stage: string; responsible: string; updated_ago: string };
type TaskItem = { id: number; text: string; complete_till: number; lead_id: number; lead_name: string; responsible: string; overdue: boolean };
type ActivityItem = { id: number; name: string; price: number; stage: string; responsible: string; updated_ago: string };
type ActiveByUser = { name: string; count: number; value: number };
type DashData = {
  pipeline: { id: number; name: string };
  pipelines: { id: number; name: string }[];
  today: { leads: number; won: number; lost: number; revenue: number };
  yesterday: { leads: number; won: number; lost: number };
  week: { leads: number; revenue: number };
  month: { leads: number; revenue: number };
  contacts: { today: number; week: number };
  funnel: FunnelStage[];
  daily: { date: string; count: number }[];
  hourly: { hour: string; count: number }[];
  totals: { won: number; lost: number; active: number; active_value: number; won_value: number };
  conversion_rate: number;
  avg_ticket: number;
  avg_close_hours: number;
  overdue_tasks: number;
  ranking: { name: string; won: number; active: number }[];
  top_leads: { id: number; name: string; price: number; stage: string; responsible: string }[];
  hot_leads: HotLead[];
  recent_activity: ActivityItem[];
  tasks_list: TaskItem[];
  active_by_user: ActiveByUser[];
  pacientes: { total: number; revenue: number; trimestral: number; semestral: number; pipeline_name: string; revenue_trimestral: number; revenue_semestral: number; avg_ticket_trimestral: number; avg_ticket_semestral: number; mrr: number } | null;
  bug_ia: number;
  fup_ativos: number;
  fup_expirados: number;
  fup_total: number;
  fup_por_etapa: { name: string; count: number }[];
  fup_conversoes: number;
  renov_ate_30: number;
  renov_30_60: number;
  renov_60_90: number;
  renov_90_365: number;
  churn: number;
  faturamento_historico: { month: string; value: number }[];
};
type SnapshotRow = {
  snapshot_date: string;
  today_leads: number; today_won: number; today_lost: number;
  total_active: number; total_won: number; total_lost: number;
};

// ─── Utils ───────────────────────────────────────────────────
const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
const COLORS = ["#00d9f5","#00e5a0","#fbbf24","#f43f5e","#a78bfa","#fb923c","#34d399","#e879f9","#84cc16","#38bdf8"];
const REFRESH_INTERVAL = 300;

function delta(curr: number, prev: number) {
  if (prev === 0) return null;
  const diff = curr - prev;
  if (diff === 0) return null;
  return { diff, up: diff > 0 };
}

// ─── Sub-components ──────────────────────────────────────────
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="w-8 h-8 rounded-lg flex items-center justify-center bg-secondary hover:bg-accent transition-colors text-sm"
      title="Alternar tema"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

function StatCard({
  label, value, sub, accent = "cyan", icon, deltaVal
}: {
  label: string; value: React.ReactNode; sub?: string;
  accent?: "cyan"|"green"|"red"|"yellow"|"purple"|"orange"|"default";
  icon?: string;
  deltaVal?: { diff: number; up: boolean } | null;
}) {
  const accentMap = {
    cyan:    { val: "text-cyan-400",   bar: "bg-cyan-400",    bg: "bg-cyan-400/8"    },
    green:   { val: "text-emerald-400",bar: "bg-emerald-400", bg: "bg-emerald-400/8" },
    red:     { val: "text-rose-400",   bar: "bg-rose-400",    bg: "bg-rose-400/8"    },
    yellow:  { val: "text-amber-400",  bar: "bg-amber-400",   bg: "bg-amber-400/8"   },
    purple:  { val: "text-violet-400", bar: "bg-violet-400",  bg: "bg-violet-400/8"  },
    orange:  { val: "text-orange-400", bar: "bg-orange-400",  bg: "bg-orange-400/8"  },
    default: { val: "text-foreground", bar: "bg-primary",     bg: "bg-primary/8"     },
  };
  const a = accentMap[accent];
  return (
    <div className={`relative overflow-hidden rounded-xl border border-border ${a.bg} card-hover p-5`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 ${a.bar} opacity-60`} />
      {icon && <span className="text-xl mb-2 block">{icon}</span>}
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-3xl font-bold stat-number ${a.val}`}>{value}</p>
      <div className="flex items-center gap-2 mt-2">
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {deltaVal && (
          <span className={`text-xs font-semibold ${deltaVal.up ? "text-emerald-400" : "text-rose-400"}`}>
            {deltaVal.up ? "↑" : "↓"}{Math.abs(deltaVal.diff)} vs ontem
          </span>
        )}
      </div>
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
      <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      <div className="grid grid-cols-2 gap-4">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>
      <div className="grid grid-cols-2 gap-4">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}</div>
    </div>
  );
}

const tooltipStyle = {
  background: "#0d1420",
  border: "1px solid #1a2540",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
};
const tooltipItemStyle = { color: "#e2e8f0" };
const tooltipLabelStyle = { color: "#94a3b8", marginBottom: 4 };

function formatDateTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ─── Funil helpers ───────────────────────────────────────────
const FUNNEL_KEYWORDS: { key: string; label: string; kw: string[] }[] = [
  { key: "contato", label: "Contato Inicial", kw: ["contato inicial", "contato"] },
  { key: "ia", label: "IA Respondeu", kw: ["em atendimento", "ia respond", "respondeu"] },
  { key: "humano", label: "Humano", kw: ["atendimento/humano", "humano"] },
  { key: "quente", label: "Lead Quente", kw: ["lead quente", "quente"] },
  { key: "fechou", label: "Fechou", kw: ["venda ganha", "ganho", "won", "fechou"] },
];

function matchFunnelStage(stageName: string, keywords: string[]): boolean {
  const lower = stageName.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

function buildFunnelStages(funnel: FunnelStage[]) {
  return FUNNEL_KEYWORDS.map(({ key, label, kw }) => {
    const matched = funnel.filter(f => matchFunnelStage(f.name, kw));
    const count = matched.reduce((s, f) => s + f.count, 0);
    return { key, label, count };
  });
}

// ─── Main Component ───────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAcc, setActiveAcc] = useState(0);
  const [pipelineId, setPipelineId] = useState<number | null>(null);
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAcc, setNewAcc] = useState({ label: "", subdomain: "", token: "" });
  const [tab, setTab] = useState<"funil" | "ia_qual" | "followup" | "financeiro" | "alertas">("funil");
  const [history, setHistory] = useState<SnapshotRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadsList, setLeadsList] = useState<{id:number;name:string;stage:string;price:number;contact_id:number|null}[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<{id:number;name:string;stage:string;contact_id:number|null} | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [meta, setMeta] = useState(0);
  const [metaInput, setMetaInput] = useState("");
  const [metaSaved, setMetaSaved] = useState(false);
  // Filtro de data da aba Funil
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Follow-up (dados vêm direto do data Kommo)

  async function loadLeads(q = "") {
    if (!accounts[activeAcc]) return;
    setLeadsLoading(true);
    try {
      const acc = accounts[activeAcc];
      const res = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: acc.subdomain, token: acc.token, pipeline_id: pipelineId, query: q }),
      });
      const json = await res.json();
      setLeadsList(json.leads || []);
    } catch {} finally { setLeadsLoading(false); }
  }

  async function analyzeLeadIA() {
    if (!selectedLead || !accounts[activeAcc]) return;
    setAnalyzing(true); setAnalysisResult(null); setAnalysisError("");
    const acc = accounts[activeAcc];
    let res: Response | null = null;
    try {
      res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: acc.subdomain, token: acc.token, lead_id: selectedLead.id, contact_id: selectedLead.contact_id }),
      });
    } catch {
      setAnalysisError("Sem conexão com o servidor. Tente novamente.");
      setAnalyzing(false); return;
    }
    let json: any = null;
    try { json = await res.json(); } catch {
      setAnalysisError("A análise demorou demais. Tente novamente.");
      setAnalyzing(false); return;
    }
    if (!json) { setAnalysisError("Resposta vazia do servidor."); setAnalyzing(false); return; }
    if (json.error) setAnalysisError(json.error);
    else setAnalysisResult(json);
    setAnalyzing(false);
  }

  useEffect(() => {
    const saved = localStorage.getItem("kommo_meta_mensal");
    if (saved && Number(saved) > 0) { setMeta(Number(saved)); setMetaInput(saved); }
  }, []);

  function saveMeta() {
    const v = Number(metaInput.replace(/\D/g, ""));
    if (v > 0) {
      setMeta(v);
      localStorage.setItem("kommo_meta_mensal", String(v));
      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 2000);
    }
  }

  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await fetch("/api/accounts");
        if (res.ok) { const json = await res.json(); if (json.accounts?.length > 0) { setAccounts(json.accounts); return; } }
      } catch {}
      try { const stored = JSON.parse(localStorage.getItem("kommo_accounts") || "[]"); setAccounts(stored); } catch {}
    }
    loadAccounts();
  }, []);

  const fetchData = useCallback(async (acc: Account, pid: number | null, df?: string, dt?: string) => {
    setLoading(true); setError("");
    try {
      const body: Record<string, unknown> = { subdomain: acc.subdomain, token: acc.token, pipeline_id: pid };
      if (df) body.date_from = df;
      if (dt) body.date_to = dt;
      const res = await fetch("/api/kommo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { router.push("/"); return; }
      const json = await res.json();
      if (json.error) setError(json.error);
      else { setData(json); if (!pid) setPipelineId(json.pipeline.id); }
    } catch { setError("Erro de conexão"); }
    finally { setLoading(false); setCountdown(REFRESH_INTERVAL); }
  }, [router]);

  useEffect(() => { if (accounts.length === 0) return; fetchData(accounts[activeAcc], pipelineId); }, [activeAcc, accounts, fetchData]);
  useEffect(() => { if (accounts.length === 0) return; const interval = setInterval(() => fetchData(accounts[activeAcc], pipelineId), REFRESH_INTERVAL * 1000); return () => clearInterval(interval); }, [activeAcc, accounts, pipelineId, fetchData]);
  useEffect(() => { if (accounts.length === 0) return; const tick = setInterval(() => setCountdown(c => c <= 1 ? REFRESH_INTERVAL : c - 1), 1000); return () => clearInterval(tick); }, [accounts]);

  function saveAccounts(list: Account[]) {
    setAccounts(list); localStorage.setItem("kommo_accounts", JSON.stringify(list));
  }
  async function addAccount() {
    if (!newAcc.label || !newAcc.subdomain || !newAcc.token) return;
    const clean = { ...newAcc, subdomain: newAcc.subdomain.replace(/^https?:\/\//, "").replace(/\.kommo\.com.*$/, "").trim() };
    try { await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(clean) }); } catch {}
    const list = [...accounts, clean];
    saveAccounts(list); setActiveAcc(list.length - 1); setPipelineId(null); setData(null);
    setNewAcc({ label: "", subdomain: "", token: "" }); setShowAddAccount(false);
  }
  function removeAccount(i: number) { const list = accounts.filter((_, idx) => idx !== i); saveAccounts(list); setActiveAcc(0); setData(null); }
  async function logout() { await fetch("/api/auth", { method: "DELETE" }); router.push("/"); }
  async function fetchHistory() {
    if (!data || accounts.length === 0) return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subdomain: accounts[activeAcc].subdomain, pipeline_id: data.pipeline.id }) });
      const json = await res.json(); setHistory(json.history || []);
    } finally { setHistoryLoading(false); }
  }

  const funnel = data?.funnel || [];
  const convRate = data?.conversion_rate ?? 0;

  // Funil de conversão por etapa com palavras-chave
  const funnelStages = buildFunnelStages(funnel);

  // Dados para gráfico taxa de conversão visual
  const convChartData = [
    { name: "Leads entrados", value: data?.month.leads ?? 0 },
    { name: "Leads fechados", value: data?.totals.won ?? 0 },
  ];

  // Dados mapa abandono IA
  const iaStages = funnelStages.slice(0, 3); // contato, ia, humano

  // Chegaram vs abandonaram por etapa
  const abandonData = funnelStages.map((s, i) => {
    const prev = i === 0 ? s.count : funnelStages[i - 1].count;
    const abandoned = i === 0 ? 0 : Math.max(0, prev - s.count);
    return { name: s.label, chegaram: s.count, abandonaram: abandoned };
  });

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background dark:grid-pattern">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/75 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 h-15 flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <span className="relative text-cyan-400 text-sm font-black tracking-tight">K</span>
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="font-bold text-sm leading-none tracking-tight">Kommo</span>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5">Dashboard</span>
            </div>
            {data && <Badge className="hidden sm:flex text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/20 ml-1">{data.pipeline.name}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <div className="flex items-center gap-1.5 hidden sm:flex">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs text-cyan-400">Atualizando</span>
              </div>
            )}
            {!loading && accounts.length > 0 && (
              <span className="text-xs text-muted-foreground hidden sm:block tabular-nums">
                <span className="text-foreground font-medium">{countdown}s</span>
              </span>
            )}
            <button onClick={() => data && accounts.length > 0 && fetchData(accounts[activeAcc], pipelineId, dateFrom, dateTo)}
              className="h-8 px-3 rounded-lg text-xs font-medium bg-secondary hover:bg-cyan-500/10 hover:text-cyan-400 border border-border hover:border-cyan-500/30 transition-all">
              ↻ Atualizar
            </button>
            <ThemeToggle />
            <button onClick={logout} className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors">Sair</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 py-5 space-y-5">

        {/* ── Accounts ── */}
        <div className="flex flex-wrap items-center gap-2">
          {accounts.map((acc, i) => (
            <div key={i} className="flex items-center rounded-lg overflow-hidden border border-border">
              <button onClick={() => { setActiveAcc(i); setPipelineId(null); setData(null); }}
                className={`px-3 py-1.5 text-sm font-medium transition-all ${i === activeAcc ? "bg-cyan-500/15 text-cyan-400 border-r border-cyan-500/20" : "bg-secondary text-secondary-foreground border-r border-border hover:bg-muted"}`}>
                {acc.label}
              </button>
              <button onClick={() => removeAccount(i)}
                className="px-2 py-1.5 text-xs bg-secondary hover:bg-rose-500/10 hover:text-rose-400 transition-colors">✕</button>
            </div>
          ))}
          <button onClick={() => setShowAddAccount(!showAddAccount)}
            className="px-3 py-1.5 rounded-lg text-sm border border-dashed border-border text-muted-foreground hover:border-cyan-500/40 hover:text-cyan-400 transition-all">
            + Conta
          </button>
        </div>

        {/* ── Add Account Form ── */}
        {showAddAccount && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Input placeholder="Nome (ex: Nutri Silvestre)" value={newAcc.label} onChange={e => setNewAcc({ ...newAcc, label: e.target.value })} />
              <Input placeholder="Subdomínio (ex: paulosjr1991)" value={newAcc.subdomain} onChange={e => setNewAcc({ ...newAcc, subdomain: e.target.value })} />
              <Input placeholder="Token de acesso" value={newAcc.token} onChange={e => setNewAcc({ ...newAcc, token: e.target.value })} />
              <button onClick={addAccount} className="h-10 rounded-lg bg-cyan-500 text-background text-sm font-semibold hover:bg-cyan-400 transition-colors">Adicionar</button>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {accounts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center"><span className="text-4xl">📊</span></div>
            <div className="text-center">
              <p className="text-lg font-semibold mb-1">Nenhuma conta configurada</p>
              <p className="text-sm text-muted-foreground">Clique em &ldquo;+ Conta&rdquo; para adicionar sua conta Kommo</p>
            </div>
          </div>
        )}

        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 text-rose-400 px-5 py-3 text-sm flex items-center gap-2"><span>⚠</span> {error}</div>}

        {accounts.length > 0 && (
          <>
            {data && (
              <div className="flex gap-2 flex-wrap">
                {data.pipelines.map(p => (
                  <button key={p.id} onClick={() => { setPipelineId(p.id); fetchData(accounts[activeAcc], p.id, dateFrom, dateTo); }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${p.id === data.pipeline.id ? "bg-cyan-500/12 text-cyan-400 border-cyan-500/25" : "border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-secondary/60"}`}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-0 border-b border-border overflow-x-auto">
              {[
                { key: "funil", label: "Funil de Atendimento" },
                { key: "ia_qual", label: "IA e Qualificação" },
                { key: "followup", label: "Follow-up" },
                { key: "financeiro", label: "Financeiro" },
                { key: "alertas", label: "Alertas" },
              ].map(t => (
                <button key={t.key}
                  onClick={() => { setTab(t.key as any); if (t.key === "ia_qual") { loadLeads(""); } }}
                  className={`px-5 py-3 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? "border-cyan-400 text-cyan-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
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
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="h-8 px-3 rounded-lg text-xs bg-secondary border border-border outline-none focus:border-cyan-500/50 transition-colors"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Até</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="h-8 px-3 rounded-lg text-xs bg-secondary border border-border outline-none focus:border-cyan-500/50 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => fetchData(accounts[activeAcc], pipelineId, dateFrom, dateTo)}
                    className="h-8 px-4 rounded-lg text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25 transition-all">
                    Aplicar
                  </button>
                  {(dateFrom || dateTo) && (
                    <button
                      onClick={() => { setDateFrom(""); setDateTo(""); fetchData(accounts[activeAcc], pipelineId); }}
                      className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-rose-400 border border-border hover:border-rose-500/30 transition-all">
                      Limpar
                    </button>
                  )}
                </div>

                {/* Row 1 — Leads por período */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard label="Leads hoje" value={data.today.leads} accent="cyan" icon="📥"
                    sub={`${data.today.won} ganhos · ${data.today.lost} perdidos`}
                    deltaVal={delta(data.today.leads, data.yesterday.leads)} />
                  <StatCard label="Esta semana" value={data.week.leads} accent="purple" icon="📅"
                    sub={data.week.revenue > 0 ? `${BRL(data.week.revenue)} faturados` : "desde segunda"} />
                  <StatCard label="Este mês" value={data.month.leads} accent="orange" icon="📆"
                    sub={data.month.revenue > 0 ? `${BRL(data.month.revenue)} faturados` : "mês atual"} />
                </div>

                {/* Row 2 — KPIs principais */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatCard label="Vendas hoje" value={data.today.won} accent="green"
                    sub={data.today.revenue > 0 ? BRL(data.today.revenue) : "leads ganhos hoje"}
                    deltaVal={delta(data.today.won, data.yesterday.won)} />

                  {/* Taxa de conversão */}
                  <div className="relative overflow-hidden rounded-xl border border-border bg-card card-hover p-5">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400 to-emerald-400" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Taxa de conversão</p>
                    <p className={`text-3xl font-bold stat-number mb-3 ${convRate >= 70 ? "text-emerald-400" : convRate >= 40 ? "text-amber-400" : "text-rose-400"}`}>{convRate.toFixed(1)}%</p>
                    <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${convRate >= 70 ? "bg-emerald-400" : convRate >= 40 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${Math.min(convRate, 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">leads fechados / leads novos</p>
                  </div>

                  <StatCard label="Tempo médio de resposta" value={`${data.avg_close_hours}h`} accent="cyan" sub="para fechar" />
                </div>

                {/* Gráficos */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Taxa de conversão visual */}
                  <PanelCard title="Taxa de conversão visual" icon="📊">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={convChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                        <Bar dataKey="value" radius={[6,6,0,0]} name="Leads">
                          {convChartData.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? "#00d9f5" : "#00e5a0"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </PanelCard>

                  {/* Funil de conversão por etapa */}
                  <PanelCard title="Funil de conversão por etapa" icon="🔽">
                    {funnelStages.every(s => s.count === 0) ? (
                      <p className="text-muted-foreground text-sm text-center py-8">Sem dados de funil para essas etapas</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={funnelStages} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => [`${v} leads`, "Leads"]} />
                          <Bar dataKey="count" radius={[6,6,0,0]} name="Leads">
                            {funnelStages.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </PanelCard>
                </div>

                {/* Volume por etapa do funil (barras horizontais) */}
                {funnel.length > 0 && (
                  <PanelCard title="Volume por etapa do funil" icon="📊">
                    <div className="space-y-3">
                      {funnel.map((stage, i) => {
                        const maxCount = Math.max(...funnel.map(f => f.count), 1);
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="font-medium truncate max-w-[55%]">{stage.name}</span>
                              <div className="flex gap-4 text-muted-foreground shrink-0">
                                <span className="font-bold text-foreground stat-number">{stage.count}</span>
                                {stage.value > 0 && <span>{BRL(stage.value)}</span>}
                                {stage.rate !== undefined && <span className="text-emerald-400 font-medium">{stage.rate.toFixed(0)}%</span>}
                              </div>
                            </div>
                            <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${(stage.count / maxCount) * 100}%`, background: COLORS[i % COLORS.length] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </PanelCard>
                )}

                {/* Leads por dia últimos 30 dias */}
                <PanelCard title="Leads por dia — últimos 30 dias" icon="📈">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.daily}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                      <Line type="monotone" dataKey="count" stroke="#00d9f5" strokeWidth={2} dot={false} name="Leads" />
                    </LineChart>
                  </ResponsiveContainer>
                </PanelCard>

              </div>
            )}

            {/* ════ IA E QUALIFICAÇÃO ════ */}
            {tab === "ia_qual" && (
              <div className="space-y-5">

                {/* Cards IA */}
                {data && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {/* Taxa de conclusão IA */}
                      {(() => {
                        const contato = funnelStages.find(s => s.key === "contato")?.count ?? 0;
                        const humano = funnelStages.find(s => s.key === "humano")?.count ?? 0;
                        const taxa = contato > 0 ? Math.round((humano / contato) * 100) : 0;
                        return (
                          <StatCard label="Conclusão da IA" value={`${taxa}%`}
                            accent={taxa >= 60 ? "green" : taxa >= 30 ? "yellow" : "red"}
                            icon="🤖"
                            sub="leads que chegaram à etapa Humano" />
                        );
                      })()}
                      {/* Handoff a humano */}
                      {(() => {
                        const total = data.month.leads > 0 ? data.month.leads : 1;
                        const humano = funnelStages.find(s => s.key === "humano")?.count ?? 0;
                        const taxa = Math.round((humano / total) * 100);
                        return (
                          <StatCard label="Handoff a humano" value={`${taxa}%`}
                            accent="cyan" icon="🤝"
                            sub="leads novos que chegaram a Humano" />
                        );
                      })()}
                      <StatCard label="Tempo IA → Humano" value={`${data.avg_close_hours}h`}
                        accent="purple" icon="⏱"
                        sub="tempo médio estimado" />
                      {(() => {
                        const total = data.month.leads > 0 ? data.month.leads : 1;
                        const taxaErro = Math.round((data.bug_ia / total) * 100);
                        return (
                          <StatCard label="Taxa de erro IA" value={`${taxaErro}%`}
                            accent={data.bug_ia > 0 ? "red" : "green"} icon="⚠️"
                            sub={`${data.bug_ia} leads com bug`} />
                        );
                      })()}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Mapa de abandono por pergunta */}
                      <PanelCard title="Mapa de abandono por etapa IA" icon="📉">
                        {iaStages.every(s => s.count === 0) ? (
                          <p className="text-muted-foreground text-sm text-center py-8">Sem dados de etapas IA</p>
                        ) : (
                          <div className="space-y-4">
                            {iaStages.map((s, i) => {
                              const maxC = Math.max(...iaStages.map(x => x.count), 1);
                              return (
                                <div key={s.key}>
                                  <div className="flex justify-between text-xs mb-1.5">
                                    <span className="font-medium">{s.label}</span>
                                    <span className="font-bold stat-number" style={{ color: COLORS[i] }}>{s.count} leads</span>
                                  </div>
                                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${(s.count / maxC) * 100}%`, background: COLORS[i] }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </PanelCard>

                      {/* Chegaram vs Abandonaram */}
                      <PanelCard title="Chegaram vs Abandonaram por etapa" icon="📊">
                        {abandonData.every(d => d.chegaram === 0) ? (
                          <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={abandonData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                              <Bar dataKey="chegaram" name="Chegaram" fill="#00d9f5" radius={[4,4,0,0]} />
                              <Bar dataKey="abandonaram" name="Abandonaram" fill="#f43f5e" radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </PanelCard>
                    </div>

                    {/* Bugs da IA + Tempo por etapa */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Bugs */}
                      <div className={`rounded-xl border p-6 flex flex-col gap-3 ${data.bug_ia > 0 ? "border-rose-500/30 bg-rose-500/8" : "border-emerald-500/20 bg-emerald-500/8"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{data.bug_ia > 0 ? "🔴" : "🟢"}</span>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Bugs da IA este mês</p>
                            <p className={`text-4xl font-bold stat-number ${data.bug_ia > 0 ? "text-rose-400" : "text-emerald-400"}`}>{data.bug_ia}</p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">leads travados na IA este mês</p>
                        {data.bug_ia > 0 && (
                          <p className="text-xs text-rose-400 font-medium">Fluxo quebrado — triagem manual urgente</p>
                        )}
                      </div>

                      {/* Tempo médio por etapa estimado */}
                      <PanelCard title="Tempo médio por etapa (estimado)" icon="⏱">
                        {data.avg_close_hours === 0 ? (
                          <p className="text-muted-foreground text-sm text-center py-6">Sem dados de tempo</p>
                        ) : (
                          <div className="space-y-3">
                            {funnelStages.map((s, i) => {
                              const horasEtapa = Math.round(data.avg_close_hours / funnelStages.length);
                              return (
                                <div key={s.key} className="flex items-center gap-3">
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                  <span className="text-xs flex-1">{s.label}</span>
                                  <span className="text-xs font-semibold stat-number" style={{ color: COLORS[i % COLORS.length] }}>~{horasEtapa}h</span>
                                </div>
                              );
                            })}
                            <p className="text-xs text-muted-foreground pt-2 border-t border-border">Baseado no avg_close_hours dividido pelo número de etapas</p>
                          </div>
                        )}
                      </PanelCard>
                    </div>

                    {/* Análise de lead individual */}
                    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                      <div>
                        <h3 className="text-base font-semibold flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-violet-500/15 flex items-center justify-center text-xs">🤖</span>
                          Análise Individual de Lead com IA
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">Selecione um lead para analisar objeções, dúvidas e sentimento usando GPT-4o mini</p>
                      </div>
                      <div className="flex gap-2">
                        <Input placeholder="Buscar lead por nome..." value={leadSearch}
                          onChange={e => setLeadSearch(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && loadLeads(leadSearch)} className="flex-1" />
                        <button onClick={() => loadLeads(leadSearch)} disabled={leadsLoading}
                          className="px-4 rounded-lg bg-secondary hover:bg-cyan-500/10 hover:text-cyan-400 disabled:opacity-50 text-sm font-medium border border-border hover:border-cyan-500/30 transition-all">
                          {leadsLoading ? "..." : "Buscar"}
                        </button>
                        <button onClick={() => loadLeads("")} disabled={leadsLoading}
                          className="px-3 rounded-lg bg-secondary hover:bg-accent disabled:opacity-50 text-sm border border-border transition-colors" title="Carregar 50 mais recentes">📋</button>
                      </div>
                      {leadsList.length > 0 && (
                        <div className="max-h-52 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                          {leadsList.map(l => (
                            <button key={l.id} onClick={() => { setSelectedLead(l); setAnalysisResult(null); setAnalysisError(""); }}
                              className={`w-full text-left px-4 py-3 text-sm flex justify-between items-center hover:bg-secondary/60 transition-colors ${selectedLead?.id === l.id ? "bg-violet-500/8 border-l-2 border-violet-400" : ""}`}>
                              <div><span className="font-medium">{l.name}</span><span className="text-muted-foreground text-xs ml-2">#{l.id}</span></div>
                              <Badge className="text-violet-400 bg-violet-500/10 border-violet-500/20 text-xs">{l.stage}</Badge>
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedLead && (
                        <div className="flex items-center gap-3 rounded-lg bg-secondary/60 border border-border px-4 py-3">
                          <div className="flex-1"><p className="font-medium text-sm">{selectedLead.name}</p><p className="text-muted-foreground text-xs">#{selectedLead.id} · {selectedLead.stage}</p></div>
                          <button onClick={analyzeLeadIA} disabled={analyzing}
                            className="px-5 py-2 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors">
                            {analyzing ? "Analisando..." : "Analisar"}
                          </button>
                        </div>
                      )}
                      {analysisError && <p className="text-rose-400 text-sm">{analysisError}</p>}
                    </div>

                    {analysisResult && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <StatCard
                            label="Lead analisado"
                            value={`#${analysisResult.lead_id}`}
                            sub={`${analysisResult.notes_count} mensagens · fonte: ${analysisResult.source === "whatsapp" ? "WhatsApp" : "Notas CRM"}`}
                            accent="cyan"
                            icon={analysisResult.source === "whatsapp" ? "💬" : "📝"}
                          />
                          <StatCard label="Interesse" value={analysisResult.analysis?.interesse || "-"} accent={analysisResult.analysis?.interesse === "alto" ? "green" : analysisResult.analysis?.interesse === "médio" ? "yellow" : "red"} />
                          <StatCard label="Sentimento" value={analysisResult.analysis?.sentimento || "-"} accent={analysisResult.analysis?.sentimento === "positivo" ? "green" : analysisResult.analysis?.sentimento === "negativo" ? "red" : "yellow"} />
                        </div>
                        {analysisResult.source === "whatsapp" && (
                          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-4 py-2">
                            <span className="text-emerald-400 text-sm">💬</span>
                            <p className="text-xs text-emerald-400 font-medium">Análise baseada na conversa real do WhatsApp</p>
                          </div>
                        )}
                        <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Resumo</p><p className="text-sm leading-relaxed">{analysisResult.analysis?.resumo}</p></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5">
                            <p className="text-xs text-rose-400 mb-3 font-semibold uppercase tracking-wider">Objeções</p>
                            {!(analysisResult.analysis?.objecoes?.length) ? <p className="text-muted-foreground text-sm">Nenhuma</p> : <ul className="space-y-2">{analysisResult.analysis.objecoes.map((o: string, i: number) => <li key={i} className="text-sm flex gap-2 items-start"><span className="text-rose-400 mt-0.5 shrink-0">▸</span>{o}</li>)}</ul>}
                          </div>
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                            <p className="text-xs text-amber-400 mb-3 font-semibold uppercase tracking-wider">Dúvidas</p>
                            {!(analysisResult.analysis?.duvidas?.length) ? <p className="text-muted-foreground text-sm">Nenhuma</p> : <ul className="space-y-2">{analysisResult.analysis.duvidas.map((d: string, i: number) => <li key={i} className="text-sm flex gap-2 items-start"><span className="text-amber-400 mt-0.5 shrink-0">▸</span>{d}</li>)}</ul>}
                          </div>
                        </div>
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
                          <p className="text-xs text-cyan-400 mb-3 font-semibold uppercase tracking-wider">Próximo passo</p>
                          <p className="text-sm leading-relaxed">{analysisResult.analysis?.proximo_passo}</p>
                        </div>
                        {analysisResult.analysis?.abordagem_fechamento && (
                          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 space-y-4">
                            <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">🎯 Abordagem de Fechamento</p>
                            {analysisResult.analysis.abordagem_fechamento.script && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-2 font-medium">Script sugerido</p>
                                <div className="bg-background/60 rounded-lg border border-emerald-500/20 px-4 py-3">
                                  <p className="text-sm leading-relaxed italic">"{analysisResult.analysis.abordagem_fechamento.script}"</p>
                                </div>
                              </div>
                            )}
                            {analysisResult.analysis.abordagem_fechamento.gatilhos?.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-2 font-medium">Gatilhos a usar</p>
                                <div className="flex flex-wrap gap-2">
                                  {analysisResult.analysis.abordagem_fechamento.gatilhos.map((g: string, i: number) => (
                                    <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">{g}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {analysisResult.analysis.abordagem_fechamento.alerta && (
                              <div className="flex gap-2 items-start rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2.5">
                                <span className="text-amber-400 text-sm shrink-0">⚠</span>
                                <p className="text-xs text-amber-300 leading-relaxed">{analysisResult.analysis.abordagem_fechamento.alerta}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {!data && loading && <LoadingGrid />}
                {!data && !loading && (
                  <div className="text-center py-16 text-muted-foreground text-sm">Carregando dados...</div>
                )}
              </div>
            )}

            {/* ════ FOLLOW-UP ════ */}
            {tab === "followup" && (
              <div className="space-y-5">
                {loading && !data && <div className="flex items-center gap-2 text-sm text-muted-foreground"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />Carregando follow-up...</div>}

                {data && (
                  <>
                    {/* Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-cyan-500/8 card-hover p-5">
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-cyan-400 opacity-60" />
                        <span className="text-xl mb-2 block">📬</span>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Leads na cadência ativa</p>
                        <p className="text-3xl font-bold stat-number text-cyan-400">{data.fup_ativos}</p>
                        <p className="text-xs text-muted-foreground mt-2">de {data.fup_total} total</p>
                      </div>
                      <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/8 card-hover p-5">
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-400 opacity-60" />
                        <span className="text-xl mb-2 block">🔄</span>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Taxa de reengajamento</p>
                        <p className="text-3xl font-bold stat-number text-emerald-400">
                          {data.fup_total > 0 ? `${Math.round((data.fup_conversoes / data.fup_total) * 100)}%` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">{data.fup_conversoes} convertidos de {data.fup_total}</p>
                      </div>
                      <div className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/8 card-hover p-5">
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-violet-400 opacity-60" />
                        <span className="text-xl mb-2 block">✅</span>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Conversões via follow-up</p>
                        <p className="text-3xl font-bold stat-number text-violet-400">{data.fup_conversoes}</p>
                        <p className="text-xs text-muted-foreground mt-2">vendas ganhas no funil FUP</p>
                      </div>
                      <div className="relative overflow-hidden rounded-xl border border-rose-500/20 bg-rose-500/8 card-hover p-5">
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-rose-400 opacity-60" />
                        <span className="text-xl mb-2 block">⌛</span>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Leads expirados</p>
                        <p className="text-3xl font-bold stat-number text-rose-400">{data.fup_expirados}</p>
                        <p className="text-xs text-muted-foreground mt-2">passaram pelo FUP7 → nutrição</p>
                      </div>
                    </div>

                    {/* Gráficos FUP */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Leads por etapa FUP1–FUP7 */}
                      <div className="rounded-xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><span>📊</span>Leads por etapa (FUP1–FUP7)</h3>
                        {data.fup_por_etapa.length > 0 ? (
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={data.fup_por_etapa} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
                              <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} width={50} />
                              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v: number) => [`${v} leads`, "Leads"]} />
                              <Bar dataKey="count" name="Leads" radius={[0,4,4,0]}>
                                {data.fup_por_etapa.map((_, i) => (
                                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-40 rounded-lg border border-dashed border-border">
                            <p className="text-sm text-muted-foreground">Nenhuma etapa FUP encontrada no funil Follow Up</p>
                          </div>
                        )}
                      </div>

                      {/* Desempenho resumido */}
                      <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
                        <h3 className="text-sm font-semibold flex items-center gap-2"><span>🎯</span>Desempenho do Follow-up</h3>
                        <div className="space-y-3">
                          {[
                            { label: "Em cadência ativa", value: data.fup_ativos, color: "#00d9f5", max: data.fup_total || 1 },
                            { label: "Convertidos (ganhos)", value: data.fup_conversoes, color: "#00e5a0", max: data.fup_total || 1 },
                            { label: "Expirados (nutrição)", value: data.fup_expirados, color: "#f43f5e", max: data.fup_total || 1 },
                          ].map(row => {
                            const pct = Math.min(Math.round((row.value / row.max) * 100), 100);
                            return (
                              <div key={row.label}>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">{row.label}</span>
                                  <span className="font-bold stat-number" style={{ color: row.color }}>{row.value} ({pct}%)</span>
                                </div>
                                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: row.color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-auto pt-3 border-t border-border">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Total de leads no FUP</span>
                            <span className="font-bold text-foreground">{data.fup_total}</span>
                          </div>
                          {data.fup_total > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Taxa de conversão via FUP:{" "}
                              <span className="text-emerald-400 font-semibold">
                                {Math.round((data.fup_conversoes / data.fup_total) * 100)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ════ FINANCEIRO ════ */}
            {tab === "financeiro" && (
              <div className="space-y-5">

                {/* Header com meta */}
                <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/8 to-cyan-500/5 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm">💰</span>
                        Financeiro
                      </h2>
                      <p className="text-xs text-muted-foreground mt-1">Funil "{data?.pacientes?.pipeline_name || "Pacientes Ativos"}" · faturamento por plano fechado</p>
                    </div>
                    {/* Configurar Meta */}
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-lg overflow-hidden border border-border">
                        <span className="px-3 flex items-center text-xs text-muted-foreground bg-secondary border-r border-border">R$</span>
                        <input
                          type="text"
                          placeholder="Ex: 20000"
                          value={metaInput}
                          onChange={e => setMetaInput(e.target.value.replace(/\D/g, ""))}
                          onKeyDown={e => e.key === "Enter" && saveMeta()}
                          className="w-32 px-3 py-2 text-sm bg-background outline-none"
                        />
                      </div>
                      <button onClick={saveMeta}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${metaSaved ? "bg-emerald-500 text-white" : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30"}`}>
                        {metaSaved ? "✓ Salvo" : "Definir meta"}
                      </button>
                    </div>
                  </div>

                  {/* Barra de progresso vs meta */}
                  {data?.pacientes && meta > 0 && (() => {
                    const pct = Math.min(Math.round((data.pacientes.revenue / meta) * 100), 100);
                    const over = data.pacientes.revenue > meta;
                    return (
                      <div>
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-muted-foreground">Progresso em relação à meta mensal</span>
                          <span className={`font-bold text-sm ${over ? "text-emerald-400" : pct >= 70 ? "text-amber-400" : "text-rose-400"}`}>
                            {pct}% {over && "🎉 Meta batida!"}
                          </span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${over ? "bg-gradient-to-r from-emerald-400 to-cyan-400" : pct >= 70 ? "bg-amber-400" : "bg-rose-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs mt-2 text-muted-foreground">
                          <span>{BRL(data.pacientes.revenue)} faturado</span>
                          <span>Meta: {BRL(meta)}</span>
                        </div>
                        {!over && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Faltam <span className="text-foreground font-semibold">{BRL(meta - data.pacientes.revenue)}</span> para bater a meta
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {meta === 0 && (
                    <p className="text-xs text-muted-foreground">
                      ↑ Configure uma meta mensal acima para ver o progresso
                    </p>
                  )}
                  {data && !data.pacientes && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-400 space-y-1">
                      <p>⚠ Nenhum pipeline com "paciente" no nome foi encontrado.</p>
                      <p className="text-muted-foreground">Pipelines disponíveis: <span className="text-foreground">{data?.pipelines.map(p => `"${p.name}"`).join(" · ")}</span></p>
                      <p className="text-muted-foreground">O pipeline precisa ter a palavra <span className="text-amber-400 font-semibold">paciente</span> no nome.</p>
                    </div>
                  )}
                </div>

                {data?.pacientes && (
                  <>
                    {/* Row 1 — Faturamento principal */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard
                        label="Faturamento total"
                        value={BRL(data.pacientes.revenue)}
                        accent="green" icon="💰"
                        sub={`${data.pacientes.total} pacientes no funil`}
                      />
                      <StatCard
                        label="MRR estimado"
                        value={BRL(data.pacientes.mrr)}
                        accent="cyan" icon="📈"
                        sub="receita mensal recorrente"
                      />
                      <StatCard
                        label="Ticket médio Trimestral"
                        value={data.pacientes.avg_ticket_trimestral > 0 ? BRL(data.pacientes.avg_ticket_trimestral) : "—"}
                        accent="orange" icon="🎯"
                        sub="por paciente trimestral"
                      />
                      <StatCard
                        label="Ticket médio Semestral"
                        value={data.pacientes.avg_ticket_semestral > 0 ? BRL(data.pacientes.avg_ticket_semestral) : "—"}
                        accent="purple" icon="🎯"
                        sub="por paciente semestral"
                      />
                    </div>

                    {/* Row 2 — Planos */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard
                        label="Plano Trimestral"
                        value={data.pacientes.trimestral}
                        accent="cyan" icon="📅"
                        sub={data.pacientes.trimestral > 0 ? `${Math.round(data.pacientes.trimestral / data.pacientes.total * 100)}% do total` : "nenhum ainda"}
                      />
                      <StatCard
                        label="Fat. Trimestral"
                        value={BRL(data.pacientes.revenue_trimestral)}
                        accent="cyan" icon="💵"
                        sub={data.pacientes.avg_ticket_trimestral > 0 ? `ticket médio ${BRL(data.pacientes.avg_ticket_trimestral)}` : "—"}
                      />
                      <StatCard
                        label="Plano Semestral"
                        value={data.pacientes.semestral}
                        accent="purple" icon="📆"
                        sub={data.pacientes.semestral > 0 ? `${Math.round(data.pacientes.semestral / data.pacientes.total * 100)}% do total` : "nenhum ainda"}
                      />
                      <StatCard
                        label="Fat. Semestral"
                        value={BRL(data.pacientes.revenue_semestral)}
                        accent="purple" icon="💵"
                        sub={data.pacientes.avg_ticket_semestral > 0 ? `ticket médio ${BRL(data.pacientes.avg_ticket_semestral)}` : "—"}
                      />
                    </div>

                    {/* Row 3 — LTV + Churn */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard
                        label="LTV Trimestral"
                        value={data.pacientes.avg_ticket_trimestral > 0 ? BRL(data.pacientes.avg_ticket_trimestral) : "—"}
                        accent="cyan" icon="🏆"
                        sub="ticket × 1 (3 meses)"
                      />
                      <StatCard
                        label="LTV Semestral"
                        value={data.pacientes.avg_ticket_semestral > 0 ? BRL(data.pacientes.avg_ticket_semestral * 2) : "—"}
                        accent="purple" icon="🏆"
                        sub="ticket × 2 (6 meses)"
                      />
                      <StatCard
                        label="Churn (último mês)"
                        value={data.churn}
                        accent={data.churn > 0 ? "red" : "green"} icon="📉"
                        sub={data.churn === 0 ? "nenhuma saída este mês" : "pacientes que cancelaram"}
                      />
                      <StatCard
                        label="Sem plano identificado"
                        value={data.pacientes.total - data.pacientes.trimestral - data.pacientes.semestral}
                        accent="yellow" icon="❓"
                        sub="sem tag de plano"
                      />
                    </div>

                    {/* Gráficos */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Mix de planos — pizza */}
                      {(data.pacientes.trimestral + data.pacientes.semestral) > 0 && (
                        <PanelCard title="Mix de planos" icon="🥧">
                          <div className="flex gap-4 items-center">
                            <div className="shrink-0" style={{ width: 180, height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={[
                                      { name: "Trimestral", value: data.pacientes.trimestral },
                                      { name: "Semestral", value: data.pacientes.semestral },
                                    ]}
                                    cx="50%" cy="50%"
                                    innerRadius={40}
                                    outerRadius={80}
                                    dataKey="value"
                                    strokeWidth={2}
                                    stroke="hsl(220 43% 8%)"
                                  >
                                    <Cell fill="#00d9f5" />
                                    <Cell fill="#a78bfa" />
                                  </Pie>
                                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex-1 space-y-3">
                              {[
                                { label: "Trimestral", count: data.pacientes.trimestral, color: "#00d9f5" },
                                { label: "Semestral", count: data.pacientes.semestral, color: "#a78bfa" },
                              ].map(item => {
                                const total = data.pacientes!.trimestral + data.pacientes!.semestral;
                                const pct = Math.round((item.count / total) * 100);
                                return (
                                  <div key={item.label}>
                                    <div className="flex justify-between text-xs mb-1">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                                        <span>{item.label}</span>
                                      </div>
                                      <span className="font-bold stat-number" style={{ color: item.color }}>{item.count} ({pct}%)</span>
                                    </div>
                                    <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: item.color }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </PanelCard>
                      )}

                      {/* Evolução do faturamento — últimos 6 meses */}
                      <PanelCard title="Evolução do faturamento (6 meses)" icon="📈">
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={data.faturamento_historico} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="transparent" />
                            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="transparent" tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)} />
                            <Tooltip
                              contentStyle={tooltipStyle}
                              itemStyle={tooltipItemStyle}
                              labelStyle={tooltipLabelStyle}
                              formatter={(v: number) => [BRL(v), "Faturamento"]}
                            />
                            <Line type="monotone" dataKey="value" stroke="#00e5a0" strokeWidth={2.5} dot={{ fill: "#00e5a0", r: 4 }} activeDot={{ r: 6 }} name="Faturamento" />
                          </LineChart>
                        </ResponsiveContainer>
                        <p className="text-xs text-muted-foreground mt-2">Receita de pacientes que entraram no plano por mês (FUNIL PACIENTES ATIVOS)</p>
                      </PanelCard>
                    </div>

                    {/* Renovações */}
                    <PanelCard title="Renovações" icon="🔄">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/8 p-4 text-center">
                          <p className="text-xs text-muted-foreground mb-2">Vencem até 30 dias</p>
                          <p className="text-2xl font-bold stat-number text-rose-400">{data.renov_ate_30}</p>
                        </div>
                        <div className="rounded-lg border border-orange-500/30 bg-orange-500/8 p-4 text-center">
                          <p className="text-xs text-muted-foreground mb-2">30–60 dias</p>
                          <p className="text-2xl font-bold stat-number text-orange-400">{data.renov_30_60}</p>
                        </div>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-4 text-center">
                          <p className="text-xs text-muted-foreground mb-2">60–90 dias</p>
                          <p className="text-2xl font-bold stat-number text-amber-400">{data.renov_60_90}</p>
                        </div>
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/8 p-4 text-center">
                          <p className="text-xs text-muted-foreground mb-2">90 dias–12 meses</p>
                          <p className="text-2xl font-bold stat-number text-emerald-400">{data.renov_90_365}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">Calculado a partir do campo Data Fim Plano (ID 2040527) dos pacientes ativos</p>
                    </PanelCard>
                  </>
                )}

                {!data && loading && <LoadingGrid />}
              </div>
            )}

            {/* ════ ALERTAS ════ */}
            {tab === "alertas" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-base font-semibold mb-5 flex items-center gap-2">⚠️ Central de Alertas Operacionais</h3>
                  {data ? (() => {
                    const alerts: { icon: string; label: string; desc: string; severity: "high" | "med" | "low" }[] = [];
                    if (data.bug_ia > 0) alerts.push({ icon: "🤖", label: `${data.bug_ia} leads em Bug IA`, desc: "Fluxo quebrado — triagem manual urgente", severity: "high" });
                    if (data.overdue_tasks > 0) alerts.push({ icon: "⏰", label: `${data.overdue_tasks} tarefas atrasadas`, desc: "Com prazo vencido, ação necessária", severity: "high" });
                    if (meta === 0) alerts.push({ icon: "🎯", label: "Meta mensal não definida", desc: "Configure a meta na aba Financeiro", severity: "med" });
                    if (data.avg_close_hours > 72) alerts.push({ icon: "🐢", label: `Tempo de fechamento ${data.avg_close_hours}h`, desc: "Acima do ideal de 72h — verificar gargalo", severity: "med" });
                    if (data.today.leads === 0) alerts.push({ icon: "📭", label: "Nenhum lead hoje", desc: "Não há novos leads registrados hoje", severity: "low" });
                    if (data.conversion_rate < 10 && data.month.leads > 5) alerts.push({ icon: "📉", label: `Taxa de conversão baixa (${data.conversion_rate.toFixed(1)}%)`, desc: "Abaixo de 10% — revisar abordagem de vendas", severity: "high" });
                    const funnelContato = funnelStages.find(s => s.key === "contato")?.count ?? 0;
                    const funnelHumano = funnelStages.find(s => s.key === "humano")?.count ?? 0;
                    if (funnelContato > 0 && funnelHumano === 0) alerts.push({ icon: "🤖", label: "Nenhum lead chegou a Humano", desc: "Possível problema no fluxo da IA — verificar pipeline", severity: "high" });
                    if (alerts.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                          <span className="text-5xl">✅</span>
                          <p className="text-lg font-semibold text-emerald-400">Tudo certo!</p>
                          <p className="text-sm text-muted-foreground">Nenhum alerta operacional no momento</p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {/* Separar por severidade */}
                        {(["high", "med", "low"] as const).map(sev => {
                          const group = alerts.filter(a => a.severity === sev);
                          if (group.length === 0) return null;
                          const label = sev === "high" ? "🔴 Urgente" : sev === "med" ? "🟡 Atenção" : "🔵 Informação";
                          return (
                            <div key={sev}>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {group.map((a, i) => (
                                  <div key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border ${
                                    a.severity === "high" ? "bg-rose-500/8 border-rose-500/20" :
                                    a.severity === "med" ? "bg-amber-500/8 border-amber-500/20" :
                                    "bg-blue-500/8 border-blue-500/20"
                                  }`}>
                                    <span className="text-base mt-0.5">{a.icon}</span>
                                    <div>
                                      <p className={`text-xs font-semibold ${
                                        a.severity === "high" ? "text-rose-400" :
                                        a.severity === "med" ? "text-amber-400" :
                                        "text-blue-400"
                                      }`}>{a.label}</p>
                                      <p className="text-xs text-muted-foreground">{a.desc}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })() : (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      {loading ? "Carregando dados..." : "Nenhum dado disponível"}
                    </div>
                  )}
                </div>

                {/* Histórico de snapshots */}
                {data && (
                  <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2">📋 Histórico de snapshots</h3>
                      <button onClick={fetchHistory} disabled={historyLoading}
                        className="h-7 px-3 rounded-lg text-xs font-medium bg-secondary hover:bg-cyan-500/10 hover:text-cyan-400 border border-border hover:border-cyan-500/30 transition-all disabled:opacity-50">
                        {historyLoading ? "..." : "Carregar histórico"}
                      </button>
                    </div>
                    {historyLoading && <p className="text-muted-foreground text-sm animate-pulse">Carregando...</p>}
                    {!historyLoading && history.length === 0 && (
                      <div className="text-center py-8 rounded-lg border border-dashed border-border">
                        <p className="text-muted-foreground text-sm">Clique em "Carregar histórico" para ver snapshots anteriores</p>
                      </div>
                    )}
                    {history.length > 0 && (
                      <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-secondary/40">
                              {["Data","Novos","Ganhos","Perdidos","Ativos","Total Ganhos","Total Perdidos"].map((h, i) => (
                                <th key={i} className={`px-5 py-3 text-left text-xs font-medium uppercase tracking-wider ${i===0?"text-muted-foreground":i===1?"text-cyan-400":i===2?"text-emerald-400":i===3?"text-rose-400":i===4?"text-amber-400":i===5?"text-emerald-300":"text-rose-300"}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {history.map(row => (
                              <tr key={row.snapshot_date} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                                <td className="px-5 py-3 text-muted-foreground text-xs">{new Date(row.snapshot_date + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                                <td className="px-5 py-3 text-cyan-400 font-semibold stat-number">{row.today_leads}</td>
                                <td className="px-5 py-3 text-emerald-400 font-semibold stat-number">{row.today_won}</td>
                                <td className="px-5 py-3 text-rose-400 font-semibold stat-number">{row.today_lost}</td>
                                <td className="px-5 py-3 text-amber-400 font-semibold stat-number">{row.total_active}</td>
                                <td className="px-5 py-3 text-emerald-300 stat-number">{row.total_won}</td>
                                <td className="px-5 py-3 text-rose-300 stat-number">{row.total_lost}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="border-t border-border pt-4 pb-6">
          <p className="text-xs text-muted-foreground text-center">
            Kommo Dashboard · atualiza a cada {REFRESH_INTERVAL / 60} min
          </p>
        </div>
      </div>
    </div>
  );
}

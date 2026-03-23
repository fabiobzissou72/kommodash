"use client";
import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
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
  pacientes: { total: number; revenue: number; trimestral: number; semestral: number; pipeline_name: string } | null;
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
  const [tab, setTab] = useState<"dashboard" | "pacientes" | "historico" | "ia">("dashboard");
  const [history, setHistory] = useState<SnapshotRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chartView, setChartView] = useState<"30dias" | "hoje">("30dias");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadsList, setLeadsList] = useState<{id:number;name:string;stage:string;price:number}[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<{id:number;name:string;stage:string} | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [meta, setMeta] = useState(0);
  const [metaInput, setMetaInput] = useState("");
  const [metaSaved, setMetaSaved] = useState(false);

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
    try {
      const acc = accounts[activeAcc];
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: acc.subdomain, token: acc.token, lead_id: selectedLead.id }),
      });
      const json = await res.json();
      if (json.error) setAnalysisError(json.error);
      else setAnalysisResult(json);
    } catch { setAnalysisError("Erro de conexão"); } finally { setAnalyzing(false); }
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

  const fetchData = useCallback(async (acc: Account, pid: number | null) => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/kommo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: acc.subdomain, token: acc.token, pipeline_id: pid }),
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
  const maxFunnelCount = Math.max(...funnel.map(f => f.count), 1);
  const pieData = funnel.filter(f => f.count > 0).map(f => ({ name: f.name, value: f.count }));
  const convRate = data?.conversion_rate ?? 0;

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
            <button onClick={() => data && accounts.length > 0 && fetchData(accounts[activeAcc], pipelineId)}
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
                  <button key={p.id} onClick={() => { setPipelineId(p.id); fetchData(accounts[activeAcc], p.id); }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${p.id === data.pipeline.id ? "bg-cyan-500/12 text-cyan-400 border-cyan-500/25" : "border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-secondary/60"}`}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-0 border-b border-border">
              {[{ key: "dashboard", label: "Dashboard" }, { key: "pacientes", label: "🏥 Pacientes" }, { key: "historico", label: "Histórico" }, { key: "ia", label: "IA Análise" }].map(t => (
                <button key={t.key}
                  onClick={() => { setTab(t.key as any); if (t.key === "historico") fetchHistory(); }}
                  className={`px-5 py-3 text-sm font-medium transition-all border-b-2 -mb-px ${tab === t.key ? "border-cyan-400 text-cyan-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {loading && !data && <LoadingGrid />}

            {/* ════ PACIENTES ════ */}
            {tab === "pacientes" && (
              <div className="space-y-5">

                {/* Header card com meta */}
                <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/8 to-cyan-500/5 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm">🏥</span>
                        Pacientes Ativos
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
                      <p className="text-muted-foreground">Pipelines disponíveis: <span className="text-foreground">{data.pipelines.map(p => `"${p.name}"`).join(" · ")}</span></p>
                      <p className="text-muted-foreground">O pipeline precisa ter a palavra <span className="text-amber-400 font-semibold">paciente</span> no nome.</p>
                    </div>
                  )}
                </div>

                {/* Stats cards */}
                {data?.pacientes && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard
                        label="Faturamento total"
                        value={BRL(data.pacientes.revenue)}
                        accent="green" icon="💰"
                        sub={`${data.pacientes.total} pacientes no funil`}
                      />
                      <StatCard
                        label="Plano Trimestral"
                        value={data.pacientes.trimestral}
                        accent="cyan" icon="📅"
                        sub={data.pacientes.trimestral > 0 ? `${Math.round(data.pacientes.trimestral / data.pacientes.total * 100)}% do total` : "nenhum ainda"}
                      />
                      <StatCard
                        label="Plano Semestral"
                        value={data.pacientes.semestral}
                        accent="purple" icon="📆"
                        sub={data.pacientes.semestral > 0 ? `${Math.round(data.pacientes.semestral / data.pacientes.total * 100)}% do total` : "nenhum ainda"}
                      />
                      <StatCard
                        label="Sem plano identificado"
                        value={data.pacientes.total - data.pacientes.trimestral - data.pacientes.semestral}
                        accent="yellow" icon="❓"
                        sub="sem tag de plano"
                      />
                    </div>

                    {/* Distribuição visual */}
                    {(data.pacientes.trimestral + data.pacientes.semestral) > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* Barra de distribuição */}
                        <div className="rounded-xl border border-border bg-card p-5">
                          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">📊 Distribuição por plano</h3>
                          <div className="space-y-4">
                            {[
                              { label: "Plano Trimestral", count: data.pacientes.trimestral, color: "#00d9f5", bg: "bg-cyan-400" },
                              { label: "Plano Semestral", count: data.pacientes.semestral, color: "#a78bfa", bg: "bg-violet-400" },
                            ].map(item => {
                              const total = data.pacientes!.trimestral + data.pacientes!.semestral;
                              const pct = Math.round((item.count / total) * 100);
                              return (
                                <div key={item.label}>
                                  <div className="flex justify-between text-xs mb-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                                      <span className="font-medium">{item.label}</span>
                                    </div>
                                    <div className="flex gap-3">
                                      <span className="font-bold stat-number" style={{ color: item.color }}>{item.count} pacientes</span>
                                      <span className="text-muted-foreground">{pct}%</span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-700 ${item.bg}`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Mini visualização de proporção */}
                          <div className="mt-5 pt-4 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-2">Proporção visual</p>
                            <div className="flex h-6 rounded-lg overflow-hidden gap-0.5">
                              {data.pacientes.trimestral > 0 && (
                                <div className="bg-cyan-400 flex items-center justify-center text-[10px] font-bold text-background"
                                  style={{ width: `${Math.round(data.pacientes.trimestral / (data.pacientes.trimestral + data.pacientes.semestral) * 100)}%` }}>
                                  {Math.round(data.pacientes.trimestral / (data.pacientes.trimestral + data.pacientes.semestral) * 100)}%
                                </div>
                              )}
                              {data.pacientes.semestral > 0 && (
                                <div className="bg-violet-400 flex items-center justify-center text-[10px] font-bold text-background flex-1">
                                  {Math.round(data.pacientes.semestral / (data.pacientes.trimestral + data.pacientes.semestral) * 100)}%
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card de valor por plano estimado */}
                        <div className="rounded-xl border border-border bg-card p-5">
                          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">💡 Insights</h3>
                          <div className="space-y-4">
                            <div className="rounded-lg bg-secondary/60 px-4 py-3">
                              <p className="text-xs text-muted-foreground mb-1">Total de pacientes no funil</p>
                              <p className="text-2xl font-bold stat-number text-foreground">{data.pacientes.total}</p>
                            </div>
                            <div className="rounded-lg bg-secondary/60 px-4 py-3">
                              <p className="text-xs text-muted-foreground mb-1">Ticket médio por paciente</p>
                              <p className="text-2xl font-bold stat-number text-emerald-400">
                                {data.pacientes.total > 0 ? BRL(Math.round(data.pacientes.revenue / data.pacientes.total)) : "—"}
                              </p>
                            </div>
                            <div className="rounded-lg bg-secondary/60 px-4 py-3">
                              <p className="text-xs text-muted-foreground mb-1">Com tag de plano identificado</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
                                  <div className="h-full bg-emerald-400 rounded-full"
                                    style={{ width: `${data.pacientes.total > 0 ? Math.round((data.pacientes.trimestral + data.pacientes.semestral) / data.pacientes.total * 100) : 0}%` }} />
                                </div>
                                <span className="text-sm font-bold text-emerald-400 stat-number">
                                  {data.pacientes.total > 0 ? Math.round((data.pacientes.trimestral + data.pacientes.semestral) / data.pacientes.total * 100) : 0}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ════ HISTORICO ════ */}
            {tab === "historico" && (
              <div>
                {historyLoading && <p className="text-muted-foreground text-sm animate-pulse">Carregando...</p>}
                {!historyLoading && history.length === 0 && (
                  <div className="text-center py-16 rounded-xl border border-border border-dashed">
                    <p className="text-muted-foreground text-sm">Nenhum snapshot ainda.</p>
                  </div>
                )}
                {history.length > 0 && (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
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

            {/* ════ IA ════ */}
            {tab === "ia" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-violet-500/15 flex items-center justify-center text-xs">🤖</span>
                      Análise de Conversa com IA
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
                      <StatCard label="Lead analisado" value={`#${analysisResult.lead_id}`} sub={`${analysisResult.notes_count} notas`} accent="cyan" />
                      <StatCard label="Interesse" value={analysisResult.analysis?.interesse || "-"} accent={analysisResult.analysis?.interesse === "alto" ? "green" : analysisResult.analysis?.interesse === "médio" ? "yellow" : "red"} />
                      <StatCard label="Sentimento" value={analysisResult.analysis?.sentimento || "-"} accent={analysisResult.analysis?.sentimento === "positivo" ? "green" : analysisResult.analysis?.sentimento === "negativo" ? "red" : "yellow"} />
                    </div>
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
                  </div>
                )}
              </div>
            )}

            {/* ════ DASHBOARD ════ */}
            {tab === "dashboard" && data && (
              <div className="space-y-5">

                {/* Row 1 — Hoje + Período com delta */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard label="Leads hoje" value={data.today.leads} accent="cyan" icon="📥"
                    sub={`${data.today.won} ganhos · ${data.today.lost} perdidos`}
                    deltaVal={delta(data.today.leads, data.yesterday.leads)} />
                  <StatCard label="Esta semana" value={data.week.leads} accent="purple" icon="📅"
                    sub={data.week.revenue > 0 ? `${BRL(data.week.revenue)} faturados` : "desde segunda"} />
                  <StatCard label="Este mês" value={data.month.leads} accent="orange" icon="📆"
                    sub={data.month.revenue > 0 ? `${BRL(data.month.revenue)} faturados` : "mês atual"} />
                </div>

                {/* Row 2 — Financeiro */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Vendas hoje" value={data.today.won} accent="green"
                    sub={data.today.revenue > 0 ? BRL(data.today.revenue) : "leads ganhos hoje"}
                    deltaVal={delta(data.today.won, data.yesterday.won)} />
                  <StatCard label="Pipeline ativo" value={BRL(data.totals.active_value)} accent="yellow"
                    sub={`${data.totals.active} leads`} />
                  <StatCard label="Ticket médio" value={BRL(data.avg_ticket)} accent="cyan" sub="por lead ganho" />
                  <StatCard label="Tarefas atrasadas" value={data.overdue_tasks}
                    accent={data.overdue_tasks > 0 ? "red" : "green"} sub="prazo vencido" />
                </div>

                {/* Row 3 — Conversão + KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="col-span-2 md:col-span-1 relative overflow-hidden rounded-xl border border-border bg-card card-hover p-5">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400 to-emerald-400" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">Taxa de conversão</p>
                    <p className={`text-3xl font-bold stat-number mb-3 ${convRate >= 70 ? "text-emerald-400" : convRate >= 40 ? "text-amber-400" : "text-rose-400"}`}>{convRate.toFixed(1)}%</p>
                    <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${convRate >= 70 ? "bg-emerald-400" : convRate >= 40 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${convRate}%` }} />
                    </div>
                  </div>
                  <StatCard label="Total ganhos" value={data.totals.won} accent="green" sub={BRL(data.totals.won_value)} />
                  <StatCard label="Total perdidos" value={data.totals.lost} accent="red" />
                  <StatCard label="Tempo médio" value={`${data.avg_close_hours}h`} accent="cyan" sub="para fechar" />
                </div>

                {/* Row 3b — Contatos + Ontem */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Contatos hoje" value={data.contacts.today} accent="purple" icon="👤"
                    sub={`${data.contacts.week} esta semana`} />
                  <StatCard label="Leads ontem" value={data.yesterday.leads} accent="default" icon="📋"
                    sub={`${data.yesterday.won} ganhos · ${data.yesterday.lost} perdidos`} />
                  <StatCard label="Receita total (ganhos)" value={BRL(data.totals.won_value)} accent="green" icon="💰"
                    sub={`${data.totals.won} leads ganhos`} />
                  <StatCard label="Leads ativos" value={data.totals.active} accent="cyan" icon="🔥"
                    sub={BRL(data.totals.active_value)} />
                </div>

                {/* Row 4 — Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <PanelCard title="Leads por período">
                    <div className="flex justify-end mb-3">
                      <div className="flex rounded-lg overflow-hidden border border-border text-xs">
                        {(["30dias","hoje"] as const).map(v => (
                          <button key={v} onClick={() => setChartView(v)}
                            className={`px-3 py-1.5 transition-all ${chartView === v ? "bg-cyan-500/15 text-cyan-400" : "hover:bg-secondary text-muted-foreground"}`}>
                            {v === "30dias" ? "30 dias" : "Hoje"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      {chartView === "30dias" ? (
                        <LineChart data={data.daily}>
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                          <Line type="monotone" dataKey="count" stroke="#00d9f5" strokeWidth={2} dot={false} name="Leads" />
                        </LineChart>
                      ) : (
                        <BarChart data={data.hourly}>
                          <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                          <Bar dataKey="count" fill="#00d9f5" radius={[4,4,0,0]} name="Leads" />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </PanelCard>

                  <PanelCard title="Distribuição por etapa">
                    {pieData.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
                    ) : (
                      <div className="flex gap-4 items-center">
                        <div className="shrink-0" style={{ width: 180, height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieData}
                                cx="50%" cy="50%"
                                innerRadius={0}
                                outerRadius={85}
                                dataKey="value"
                                strokeWidth={2}
                                stroke="hsl(220 43% 8%)"
                                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                                  if (percent < 0.04) return null;
                                  const RADIAN = Math.PI / 180;
                                  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
                                  const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                  const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                  const label = `${(percent * 100).toFixed(0)}%`;
                                  return (
                                    <g>
                                      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                                        stroke="#000" strokeWidth={4} strokeLinejoin="round"
                                        style={{ fontSize: 12, fontWeight: 800, paintOrder: "stroke" }}>
                                        {label}
                                      </text>
                                      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
                                        style={{ fontSize: 12, fontWeight: 800 }}>
                                        {label}
                                      </text>
                                    </g>
                                  );
                                }}
                                labelLine={false}
                              >
                                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                              </Pie>
                              <Tooltip
                                contentStyle={tooltipStyle}
                                itemStyle={tooltipItemStyle}
                                labelStyle={tooltipLabelStyle}
                                formatter={(value: number, name: string) => {
                                  const total = pieData.reduce((s, d) => s + d.value, 0);
                                  return [`${value} leads (${((value / total) * 100).toFixed(1)}%)`, name];
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {pieData.map((entry, i) => {
                            const total = pieData.reduce((s, d) => s + d.value, 0);
                            const pct = ((entry.value / total) * 100).toFixed(1);
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                <span className="text-xs text-muted-foreground truncate flex-1">{entry.name}</span>
                                <span className="text-xs font-semibold stat-number shrink-0">{pct}%</span>
                                <span className="text-xs text-muted-foreground stat-number shrink-0 w-6 text-right">{entry.value}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </PanelCard>
                </div>

                {/* Row 4b — Distribuição por responsável */}
                {data.active_by_user?.length > 0 && (
                  <PanelCard title="Leads ativos por responsável" icon="👥">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                      {data.active_by_user.map((u, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium truncate">{u.name}</span>
                              <span className="text-xs text-muted-foreground ml-2 shrink-0 stat-number">{u.count} · {BRL(u.value)}</span>
                            </div>
                            <div className="w-full bg-secondary rounded-full h-1 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(u.count / (data.active_by_user[0]?.count || 1)) * 100}%`, background: COLORS[i % COLORS.length] }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PanelCard>
                )}

                {/* Row 5 — Funil */}
                {funnel.length > 0 && (
                  <PanelCard title="Funil de vendas" icon="📊">
                    <div className="space-y-3">
                      {funnel.map((stage, i) => (
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
                            <div className="h-full rounded-full transition-all" style={{ width: `${(stage.count / maxFunnelCount) * 100}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </PanelCard>
                )}

                {/* Row 5b — Hot Leads + Tarefas */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* Hot leads */}
                  {data.hot_leads?.length > 0 && (
                    <PanelCard title="Leads quentes (atividade recente)" icon="🔥">
                      <div className="space-y-2">
                        {data.hot_leads.map((l, i) => (
                          <div key={l.id} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                            <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{l.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{l.stage} · {l.responsible}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-emerald-400 stat-number">{BRL(l.price)}</p>
                              <p className="text-xs text-cyan-400">{l.updated_ago}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </PanelCard>
                  )}

                  {/* Tarefas */}
                  {data.tasks_list?.length > 0 && (
                    <PanelCard title="Tarefas pendentes" icon="✅">
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {data.tasks_list.map(t => (
                          <div key={t.id} className={`flex items-start gap-3 py-2 border-b border-border/40 last:border-0 ${t.overdue ? "opacity-90" : ""}`}>
                            <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${t.overdue ? "bg-rose-400" : "bg-emerald-400"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{t.text}</p>
                              <p className="text-xs text-muted-foreground truncate">{t.lead_name}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-medium ${t.overdue ? "text-rose-400" : "text-muted-foreground"}`}>
                                {formatDateTime(t.complete_till)}
                              </p>
                              <p className="text-xs text-muted-foreground truncate max-w-[70px]">{t.responsible}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </PanelCard>
                  )}
                </div>

                {/* Row 6 — Atividade recente + Ranking */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* Atividade recente */}
                  {data.recent_activity?.length > 0 && (
                    <PanelCard title="Atividade recente no pipeline" icon="⚡">
                      <div className="space-y-2">
                        {data.recent_activity.slice(0, 10).map((a, i) => (
                          <div key={a.id} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{a.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{a.stage}</p>
                            </div>
                            <div className="text-right shrink-0">
                              {a.price > 0 && <p className="text-xs font-medium text-emerald-400 stat-number">{BRL(a.price)}</p>}
                              <p className="text-xs text-cyan-400">{a.updated_ago}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </PanelCard>
                  )}

                  {/* Ranking vendedores */}
                  {data.ranking?.length > 0 && (
                    <PanelCard title="Ranking de vendedores" icon="🏆">
                      <div className="space-y-3">
                        {data.ranking.map((r, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className={`text-sm font-bold w-6 shrink-0 text-right ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-500" : "text-muted-foreground"}`}>{i + 1}</span>
                            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{r.name}</p></div>
                            <div className="flex gap-3 text-xs shrink-0">
                              <span className="text-emerald-400 font-semibold stat-number">{r.won} ganhos</span>
                              <span className="text-muted-foreground stat-number">{r.active} ativos</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </PanelCard>
                  )}
                </div>

                {/* Row 7 — Top leads por valor */}
                {data.top_leads?.length > 0 && (
                  <PanelCard title="Top leads por valor" icon="💎">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                      {data.top_leads.slice(0, 10).map((lead, i) => (
                        <div key={lead.id} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                          <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{lead.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{lead.stage} · {lead.responsible}</p>
                          </div>
                          <p className="text-sm font-bold text-emerald-400 stat-number shrink-0">{BRL(lead.price)}</p>
                        </div>
                      ))}
                    </div>
                  </PanelCard>
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

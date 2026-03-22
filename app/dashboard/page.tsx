"use client";
import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar,
} from "recharts";
import { useRouter } from "next/navigation";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899","#84cc16","#14b8a6"];
const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

type Account = { label: string; subdomain: string; token: string };
type FunnelStage = { name: string; count: number; value: number; rate?: number };
type DashData = {
  pipeline: { id: number; name: string };
  pipelines: { id: number; name: string }[];
  today: { leads: number; won: number; lost: number; revenue: number };
  week: { leads: number };
  month: { leads: number };
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
};
type SnapshotRow = {
  snapshot_date: string;
  today_leads: number; today_won: number; today_lost: number;
  total_active: number; total_won: number; total_lost: number;
};

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
  const [tab, setTab] = useState<"dashboard" | "historico" | "ia">("dashboard");
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

  async function loadLeads(q = "") {
    if (!accounts[activeAcc]) return;
    setLeadsLoading(true);
    try {
      const acc = accounts[activeAcc];
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: acc.subdomain, token: acc.token, pipeline_id: pipelineId, query: q }),
      });
      const json = await res.json();
      setLeadsList(json.leads || []);
    } catch {}
    finally { setLeadsLoading(false); }
  }

  async function analyzeLeadIA() {
    if (!selectedLead || !accounts[activeAcc]) return;
    setAnalyzing(true); setAnalysisResult(null); setAnalysisError("");
    try {
      const acc = accounts[activeAcc];
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: acc.subdomain, token: acc.token, lead_id: selectedLead.id }),
      });
      const json = await res.json();
      if (json.error) setAnalysisError(json.error);
      else setAnalysisResult(json);
    } catch { setAnalysisError("Erro de conexão"); }
    finally { setAnalyzing(false); }
  }
  const REFRESH_INTERVAL = 300; // 5 minutos
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);

  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await fetch("/api/accounts");
        if (res.ok) {
          const json = await res.json();
          if (json.accounts?.length > 0) {
            setAccounts(json.accounts);
            localStorage.setItem("kommo_accounts", JSON.stringify(json.accounts));
            return;
          }
        }
      } catch {}
      // fallback localStorage
      try {
        const stored = JSON.parse(localStorage.getItem("kommo_accounts") || "[]");
        setAccounts(stored);
      } catch {}
    }
    loadAccounts();
  }, []);

  const fetchData = useCallback(async (acc: Account, pid: number | null) => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/kommo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: acc.subdomain, token: acc.token, pipeline_id: pid }),
      });
      if (res.status === 401) { router.push("/"); return; }
      const json = await res.json();
      if (json.error) setError(json.error);
      else { setData(json); if (!pid) setPipelineId(json.pipeline.id); }
    } catch { setError("Erro de conexão"); }
    finally { setLoading(false); setCountdown(REFRESH_INTERVAL); }
  }, [router]);

  useEffect(() => {
    if (accounts.length === 0) return;
    fetchData(accounts[activeAcc], pipelineId);
  }, [activeAcc, accounts, fetchData]);

  useEffect(() => {
    if (accounts.length === 0) return;
    const interval = setInterval(() => fetchData(accounts[activeAcc], pipelineId), REFRESH_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [activeAcc, accounts, pipelineId, fetchData]);

  useEffect(() => {
    if (accounts.length === 0) return;
    const tick = setInterval(() => setCountdown(c => c <= 1 ? REFRESH_INTERVAL : c - 1), 1000);
    return () => clearInterval(tick);
  }, [accounts]);

  function saveAccounts(list: Account[]) {
    setAccounts(list);
    localStorage.setItem("kommo_accounts", JSON.stringify(list));
  }
  async function addAccount() {
    if (!newAcc.label || !newAcc.subdomain || !newAcc.token) return;
    const clean = { ...newAcc, subdomain: newAcc.subdomain.replace(/^https?:\/\//, "").replace(/\.kommo\.com.*$/, "").trim() };
    // salvar no banco
    try {
      await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clean),
      });
    } catch {}
    const list = [...accounts, clean];
    saveAccounts(list); setActiveAcc(list.length - 1); setPipelineId(null); setData(null);
    setNewAcc({ label: "", subdomain: "", token: "" }); setShowAddAccount(false);
  }
  function removeAccount(i: number) {
    const list = accounts.filter((_, idx) => idx !== i);
    saveAccounts(list); setActiveAcc(0); setData(null);
  }
  async function logout() { await fetch("/api/auth", { method: "DELETE" }); router.push("/"); }
  async function fetchHistory() {
    if (!data || accounts.length === 0) return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: accounts[activeAcc].subdomain, pipeline_id: data.pipeline.id }),
      });
      const json = await res.json();
      setHistory(json.history || []);
    } finally { setHistoryLoading(false); }
  }

  const funnel = data?.funnel || [];
  const maxFunnelCount = Math.max(...funnel.map(f => f.count), 1);
  const pieData = funnel.filter(f => f.count > 0).map(f => ({ name: f.name, value: f.count }));
  const convRate = data?.conversion_rate ?? 0;
  const gaugeData = [{ value: convRate, fill: convRate >= 70 ? "#10b981" : convRate >= 40 ? "#f59e0b" : "#ef4444" }];

  return (
    <div className="min-h-screen bg-gray-950 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Kommo Dashboard</h1>
          {data && <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded-full">{data.pipeline.name}</span>}
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-blue-400 animate-pulse">Atualizando...</span>}
          {!loading && accounts.length > 0 && (
            <span className="text-xs text-gray-500">próximo em <span className="text-gray-300">{countdown}s</span></span>
          )}
          <button onClick={() => data && accounts.length > 0 && fetchData(accounts[activeAcc], pipelineId)}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition">
            ↻ Atualizar
          </button>
          <button onClick={logout} className="text-xs text-gray-500 hover:text-red-400 transition">Sair</button>
        </div>
      </div>

      {/* Accounts */}
      <div className="flex flex-wrap gap-2 mb-4">
        {accounts.map((acc, i) => (
          <div key={i} className="flex items-center gap-1">
            <button onClick={() => { setActiveAcc(i); setPipelineId(null); setData(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${i === activeAcc ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
              {acc.label}
            </button>
            <button onClick={() => removeAccount(i)} className="text-gray-600 hover:text-red-400 text-xs transition">✕</button>
          </div>
        ))}
        <button onClick={() => setShowAddAccount(!showAddAccount)}
          className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700 transition">
          + Conta
        </button>
      </div>

      {showAddAccount && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input placeholder="Nome (ex: Nutri Silvestre)" value={newAcc.label} onChange={e => setNewAcc({...newAcc, label: e.target.value})}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          <input placeholder="Subdomínio (ex: paulosjr1991)" value={newAcc.subdomain} onChange={e => setNewAcc({...newAcc, subdomain: e.target.value})}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          <input placeholder="Token de acesso" value={newAcc.token} onChange={e => setNewAcc({...newAcc, token: e.target.value})}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          <button onClick={addAccount} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
            Adicionar
          </button>
        </div>
      )}

      {accounts.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg mb-2">Nenhuma conta configurada</p>
          <p className="text-sm">Clique em "+ Conta" para adicionar sua conta Kommo</p>
        </div>
      )}

      {error && <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-xl p-4 mb-4">{error}</div>}

      {data && (
        <>
          {/* Pipeline selector */}
          <div className="flex gap-2 flex-wrap mb-4">
            {data.pipelines.map(p => (
              <button key={p.id} onClick={() => { setPipelineId(p.id); fetchData(accounts[activeAcc], p.id); }}
                className={`px-3 py-1 rounded-lg text-xs transition ${p.id === data.pipeline.id ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                {p.name}
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-gray-800">
            <button onClick={() => setTab("dashboard")}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 ${tab === "dashboard" ? "border-blue-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              Dashboard
            </button>
            <button onClick={() => { setTab("historico"); fetchHistory(); }}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 ${tab === "historico" ? "border-blue-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              Histórico
            </button>
            <button onClick={() => setTab("ia")}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 ${tab === "ia" ? "border-purple-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              🤖 Análise IA
            </button>
          </div>

          {/* ======= HISTÓRICO TAB ======= */}
          {tab === "historico" && (
            <div>
              {historyLoading && <p className="text-gray-400 text-sm animate-pulse">Carregando...</p>}
              {!historyLoading && history.length === 0 && (
                <p className="text-gray-500 text-sm">Nenhum snapshot ainda. Os dados são registrados automaticamente a cada atualização.</p>
              )}
              {history.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead><tr className="text-gray-500 border-b border-gray-800">
                      <th className="pb-2 pr-4">Data</th>
                      <th className="pb-2 pr-4 text-blue-400">Novos no dia</th>
                      <th className="pb-2 pr-4 text-green-400">Ganhos no dia</th>
                      <th className="pb-2 pr-4 text-red-400">Perdidos no dia</th>
                      <th className="pb-2 pr-4 text-yellow-400">Ativos (total)</th>
                      <th className="pb-2 pr-4 text-green-300">Ganhos (histórico)</th>
                      <th className="pb-2 text-red-300">Perdidos (histórico)</th>
                    </tr></thead>
                    <tbody>
                      {history.map(row => (
                        <tr key={row.snapshot_date} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                          <td className="py-2 pr-4 text-gray-300">{new Date(row.snapshot_date + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                          <td className="py-2 pr-4 text-blue-400 font-semibold">{row.today_leads}</td>
                          <td className="py-2 pr-4 text-green-400 font-semibold">{row.today_won}</td>
                          <td className="py-2 pr-4 text-red-400 font-semibold">{row.today_lost}</td>
                          <td className="py-2 pr-4 text-yellow-400 font-semibold">{row.total_active}</td>
                          <td className="py-2 pr-4 text-green-300">{row.total_won}</td>
                          <td className="py-2 text-red-300">{row.total_lost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ======= IA TAB ======= */}
          {tab === "ia" && (
            <div className="space-y-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-1">🤖 Análise de Conversa com IA</h3>
                <p className="text-gray-500 text-xs mb-4">Selecione um lead para analisar objeções, dúvidas e sentimento usando GPT-4o mini</p>

                {/* Busca de leads */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Buscar lead por nome..."
                    value={leadSearch}
                    onChange={e => setLeadSearch(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={() => loadLeads(leadSearch)}
                    disabled={leadsLoading}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm transition"
                  >
                    {leadsLoading ? "..." : "Buscar"}
                  </button>
                  <button
                    onClick={() => loadLeads("")}
                    disabled={leadsLoading}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm transition"
                    title="Carregar 50 mais recentes"
                  >
                    📋 Recentes
                  </button>
                </div>

                {/* Lista de leads */}
                {leadsList.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-700 mb-4">
                    {leadsList.map(l => (
                      <button
                        key={l.id}
                        onClick={() => { setSelectedLead(l); setAnalysisResult(null); setAnalysisError(""); }}
                        className={`w-full text-left px-4 py-2.5 text-sm flex justify-between items-center hover:bg-gray-800 transition border-b border-gray-800 last:border-0 ${selectedLead?.id === l.id ? "bg-purple-900/40" : ""}`}
                      >
                        <div>
                          <span className="text-white font-medium">{l.name}</span>
                          <span className="text-gray-500 text-xs ml-2">#{l.id}</span>
                        </div>
                        <span className="text-xs text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">{l.stage}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Lead selecionado + botão analisar */}
                {selectedLead && (
                  <div className="flex items-center gap-3 mb-3 bg-gray-800 rounded-lg px-4 py-3">
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{selectedLead.name}</p>
                      <p className="text-gray-400 text-xs">#{selectedLead.id} · {selectedLead.stage}</p>
                    </div>
                    <button
                      onClick={analyzeLeadIA}
                      disabled={analyzing}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                    >
                      {analyzing ? "Analisando..." : "🔍 Analisar"}
                    </button>
                  </div>
                )}

                {analysisError && <p className="text-red-400 text-sm">{analysisError}</p>}
              </div>

              {analysisResult && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Lead analisado</p>
                      <p className="text-white font-bold">#{analysisResult.lead_id}</p>
                      <p className="text-xs text-gray-600 mt-1">{analysisResult.notes_count} notas encontradas</p>
                    </div>
                    <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Interesse</p>
                      <p className={`text-lg font-bold capitalize ${
                        analysisResult.analysis?.interesse === "alto" ? "text-green-400" :
                        analysisResult.analysis?.interesse === "médio" ? "text-yellow-400" : "text-red-400"
                      }`}>{analysisResult.analysis?.interesse || "-"}</p>
                    </div>
                    <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Sentimento</p>
                      <p className={`text-lg font-bold capitalize ${
                        analysisResult.analysis?.sentimento === "positivo" ? "text-green-400" :
                        analysisResult.analysis?.sentimento === "negativo" ? "text-red-400" : "text-yellow-400"
                      }`}>{analysisResult.analysis?.sentimento || "-"}</p>
                    </div>
                  </div>

                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-2">📋 Resumo</p>
                    <p className="text-gray-200 text-sm">{analysisResult.analysis?.resumo}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-900 border border-red-900 rounded-xl p-4">
                      <p className="text-xs text-red-400 mb-2">🚫 Objeções / Resistências</p>
                      {(analysisResult.analysis?.objecoes || []).length === 0
                        ? <p className="text-gray-500 text-sm">Nenhuma identificada</p>
                        : <ul className="space-y-1">{(analysisResult.analysis?.objecoes || []).map((o: string, i: number) => (
                            <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-red-400">•</span>{o}</li>
                          ))}</ul>
                      }
                    </div>
                    <div className="bg-gray-900 border border-yellow-900 rounded-xl p-4">
                      <p className="text-xs text-yellow-400 mb-2">❓ Dúvidas</p>
                      {(analysisResult.analysis?.duvidas || []).length === 0
                        ? <p className="text-gray-500 text-sm">Nenhuma identificada</p>
                        : <ul className="space-y-1">{(analysisResult.analysis?.duvidas || []).map((d: string, i: number) => (
                            <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-yellow-400">•</span>{d}</li>
                          ))}</ul>
                      }
                    </div>
                  </div>

                  <div className="bg-gray-900 border border-blue-900 rounded-xl p-4">
                    <p className="text-xs text-blue-400 mb-2">➡️ Próximo passo sugerido</p>
                    <p className="text-gray-200 text-sm">{analysisResult.analysis?.proximo_passo}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======= DASHBOARD TAB ======= */}
          {tab === "dashboard" && <>

            {/* === ROW 1: Período (Hoje / Semana / Mês) === */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Leads hoje</p>
                <p className="text-4xl font-bold text-blue-400">{data.today.leads}</p>
                <div className="flex gap-3 mt-2">
                  <span className="text-xs text-green-400">+{data.today.won} ganhos</span>
                  <span className="text-xs text-red-400">-{data.today.lost} perdidos</span>
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Leads esta semana</p>
                <p className="text-4xl font-bold text-indigo-400">{data.week.leads}</p>
                <p className="text-xs text-gray-600 mt-2">desde segunda-feira</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Leads este mês</p>
                <p className="text-4xl font-bold text-purple-400">{data.month.leads}</p>
                <p className="text-xs text-gray-600 mt-2">mês atual</p>
              </div>
            </div>

            {/* === ROW 2: Financeiro === */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Vendas hoje</p>
                <p className="text-2xl font-bold text-green-400">{data.today.won}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {data.today.revenue > 0 ? BRL(data.today.revenue) : "leads ganhos hoje"}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Pipeline total</p>
                <p className="text-2xl font-bold text-yellow-400">{BRL(data.totals.active_value)}</p>
                <p className="text-xs text-gray-600 mt-1">{data.totals.active} leads ativos</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Ticket médio</p>
                <p className="text-2xl font-bold text-orange-400">{BRL(data.avg_ticket)}</p>
                <p className="text-xs text-gray-600 mt-1">por lead ganho</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Tarefas atrasadas</p>
                <p className={`text-2xl font-bold ${data.overdue_tasks > 0 ? "text-red-400" : "text-green-400"}`}>{data.overdue_tasks}</p>
                <p className="text-xs text-gray-600 mt-1">prazo vencido</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Tempo médio de fechamento</p>
                <p className="text-2xl font-bold text-cyan-400">
                  {data.avg_close_hours >= 24
                    ? `${Math.round(data.avg_close_hours / 24)}d`
                    : `${data.avg_close_hours}h`}
                </p>
                <p className="text-xs text-gray-600 mt-1">criação → venda ganha</p>
              </div>
            </div>

            {/* === ROW 3: Ganhos/Perdidos totais + Conversão === */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Total ganhos</p>
                <p className="text-3xl font-bold text-green-400">{data.totals.won}</p>
                <p className="text-xs text-green-600 mt-1">{BRL(data.totals.won_value)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Total perdidos</p>
                <p className="text-3xl font-bold text-red-400">{data.totals.lost}</p>
                <p className="text-xs text-gray-600 mt-1">histórico</p>
              </div>
              {/* Gauge — taxa de conversão */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center">
                <p className="text-xs text-gray-500 mb-1">Taxa de conversão</p>
                <div className="relative">
                  <ResponsiveContainer width={140} height={80}>
                    <RadialBarChart cx="50%" cy="100%" innerRadius="60%" outerRadius="100%"
                      startAngle={180} endAngle={0} data={gaugeData}>
                      <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "#1f2937" }} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="absolute bottom-0 left-0 right-0 text-center">
                    <span className={`text-2xl font-bold ${convRate >= 70 ? "text-green-400" : convRate >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                      {convRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* === ROW 4: Pizza + Linha === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Pizza */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Distribuição por etapa</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#f9fafb" }} itemStyle={{ color: "#e5e7eb" }}
                      formatter={(v: number) => [v, "leads"]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Linha 30 dias / Hoje por hora */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-300">
                    {chartView === "30dias" ? "Leads nos últimos 30 dias" : "Leads por hora hoje"}
                  </h3>
                  <div className="flex gap-1">
                    <button onClick={() => setChartView("30dias")}
                      className={`px-2 py-0.5 text-xs rounded transition ${chartView === "30dias" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}>
                      30 dias
                    </button>
                    <button onClick={() => setChartView("hoje")}
                      className={`px-2 py-0.5 text-xs rounded transition ${chartView === "hoje" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}>
                      Hoje
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartView === "30dias" ? data.daily : data.hourly}>
                    <XAxis dataKey={chartView === "30dias" ? "date" : "hour"}
                      tick={{ fill: "#6b7280", fontSize: 10 }} interval={chartView === "30dias" ? 4 : 3} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#f9fafb" }} itemStyle={{ color: "#e5e7eb" }} />
                    <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name="Leads" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* === ROW 5: Funil visual (tapering) === */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Funil de vendas</h3>
              <div className="flex flex-col gap-2">
                {funnel.map((stage, i) => {
                  const pct = maxFunnelCount > 0 ? (stage.count / maxFunnelCount) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-36 text-right text-xs text-gray-400 shrink-0">{stage.name}</div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 bg-gray-800 rounded-full h-7 overflow-hidden">
                          <div className="h-full rounded-full flex items-center px-3 transition-all"
                            style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: COLORS[i % COLORS.length] }}>
                            <span className="text-xs text-white font-semibold whitespace-nowrap">{stage.count}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 w-24 text-right shrink-0">{BRL(stage.value)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
                <span>Total ativo: <span className="text-yellow-400 font-semibold">{data.totals.active} leads</span></span>
                <span>Valor total: <span className="text-yellow-400 font-semibold">{BRL(data.totals.active_value)}</span></span>
              </div>
            </div>

            {/* === ROW 6: Barra horizontal etapas === */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Leads por etapa (comparativo)</h3>
              <ResponsiveContainer width="100%" height={Math.max(funnel.length * 36, 150)}>
                <BarChart data={funnel} layout="vertical" margin={{ left: 10, right: 40 }}>
                  <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: "#d1d5db", fontSize: 11 }} width={160} />
                  <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#f9fafb" }} itemStyle={{ color: "#e5e7eb" }}
                    formatter={(v: number, name: string) => name === "value" ? [BRL(v), "Valor"] : [v, "Leads"]} />
                  <Bar dataKey="count" name="Leads" radius={[0,4,4,0]} label={{ position: "right", fill: "#e5e7eb", fontSize: 11 }}>
                    {funnel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* === ROW 7: Valor R$ por etapa === */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Valor R$ parado em cada etapa</h3>
              <ResponsiveContainer width="100%" height={Math.max(funnel.filter(f => f.value > 0).length * 36, 150)}>
                <BarChart data={funnel.filter(f => f.value > 0)} layout="vertical" margin={{ left: 10, right: 80 }}>
                  <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 10 }}
                    tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" tick={{ fill: "#d1d5db", fontSize: 11 }} width={160} />
                  <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#f9fafb" }} itemStyle={{ color: "#e5e7eb" }}
                    formatter={(v: number) => [BRL(v), "Valor"]} />
                  <Bar dataKey="value" name="Valor" radius={[0,4,4,0]} fill="#10b981"
                    label={{ position: "right", fill: "#e5e7eb", fontSize: 11, formatter: (v: number) => BRL(v) }} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* === ROW 8: Ranking + Top Leads === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Ranking de vendedores */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Ranking de vendedores</h3>
                {data.ranking.length === 0 ? (
                  <p className="text-xs text-gray-500">Nenhum dado disponível</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.ranking.map((r, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-4">{i + 1}.</span>
                        <span className="text-sm text-gray-200 flex-1 truncate">{r.name}</span>
                        <span className="text-xs text-green-400 font-semibold">{r.won} ganhos</span>
                        <span className="text-xs text-blue-400">{r.active} ativos</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top 10 leads mais valiosos */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Top leads por valor</h3>
                {data.top_leads.length === 0 ? (
                  <p className="text-xs text-gray-500">Nenhum lead com valor definido</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.top_leads.map((l, i) => (
                      <div key={l.id} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-4">{i + 1}.</span>
                        <span className="text-xs text-gray-200 flex-1 truncate">{l.name}</span>
                        <span className="text-xs text-yellow-400 font-semibold">{BRL(l.price)}</span>
                        <span className="text-xs text-gray-500 truncate max-w-[80px]">{l.stage}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-center text-xs text-gray-700 mb-4">
              Atualiza automaticamente a cada 5 minutos • {new Date().toLocaleString("pt-BR")}
            </p>
          </>}
        </>
      )}
    </div>
  );
}

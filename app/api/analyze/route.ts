import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

async function fetchNotes(subdomain: string, token: string, leadId: number) {
  const pages: any[] = [];
  for (let page = 1; page <= 3; page++) {
    try {
      const res = await fetch(
        `https://${subdomain}.kommo.com/api/v4/leads/${leadId}/notes?limit=250&page=${page}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) break;
      const data = await res.json();
      const notes = data?._embedded?.notes || [];
      pages.push(...notes);
      if (notes.length < 250) break;
    } catch { break; }
  }
  return pages;
}

async function fetchContactPhone(subdomain: string, token: string, contactId: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://${subdomain}.kommo.com/api/v4/contacts/${contactId}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const fields: any[] = data?.custom_fields_values || [];
    const phoneField = fields.find((f: any) => f.field_code === "PHONE");
    return phoneField?.values?.[0]?.value || null;
  } catch { return null; }
}

async function fetchWhatsappHistory(phone: string): Promise<{ messages: { role: string; content: string }[]; count: number }> {
  const supabaseUrl = process.env.N8N_SUPABASE_URL;
  const supabaseKey = process.env.N8N_SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) return { messages: [], count: 0 };

  const digits = phone.replace(/\D/g, "");
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/n8n_chat_histories?session_id=like.*${digits}*&order=id.asc&limit=100`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { messages: [], count: 0 };
    const rows: any[] = await res.json();
    const messages = rows
      .map((r: any) => {
        const msg = r.message;
        if (!msg?.content || !msg?.type) return null;
        const content = String(msg.content).replace(/\{[\s\S]*"proxima_etapa"[\s\S]*\}/g, "").trim();
        if (!content) return null;
        return { role: msg.type === "human" ? "Paciente" : "IA/Atendente", content };
      })
      .filter(Boolean) as { role: string; content: string }[];
    return { messages, count: messages.length };
  } catch { return { messages: [], count: 0 }; }
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.cookies.get("auth");
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { subdomain, token, lead_id, contact_id } = await req.json();
    if (!subdomain || !token || !lead_id) {
      return NextResponse.json({ error: "Faltam campos obrigatórios" }, { status: 400 });
    }

    const clean = subdomain.replace(/^https?:\/\//, "").replace(/\.kommo\.com.*$/, "").trim();

    let source: "whatsapp" | "notas" = "notas";
    let historyText = "";
    let messageCount = 0;

    const [phone, notes] = await Promise.all([
      contact_id ? fetchContactPhone(clean, token, contact_id) : Promise.resolve(null),
      fetchNotes(clean, token, lead_id),
    ]);

    if (phone) {
      const { messages, count } = await fetchWhatsappHistory(phone);
      if (count > 0) {
        source = "whatsapp";
        messageCount = count;
        historyText = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
      }
    }

    if (source === "notas") {
      if (!notes.length) {
        return NextResponse.json({ error: "Nenhuma conversa ou nota encontrada neste lead" }, { status: 404 });
      }
      messageCount = notes.length;
      historyText = notes
        .map((n: any) => {
          const text = n.params?.text || n.params?.value || "";
          if (!text.trim()) return null;
          const type = n.note_type;
          const role = type === 10 ? "Paciente" : type === 12 ? "Atendente" : type === 4 ? "Sistema/IA" : "Sistema";
          const d = new Date(n.created_at * 1000);
          const date = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
          return `[${date}] ${role}: ${text}`;
        })
        .filter(Boolean)
        .join("\n");
    }

    // DEBUG: retorna antes do OpenAI para isolar o problema
    return NextResponse.json({ debug: true, source, notes_count: messageCount, historyLen: historyText.length });

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.3,
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: `Você é um analista de vendas especializado em nutrição/saúde.
Analise o histórico de conversa de um lead e retorne um JSON com:
- resumo: resumo em 2-3 linhas do que foi discutido
- objecoes: lista das principais objeções/resistências do paciente (max 5)
- duvidas: lista das principais dúvidas do paciente (max 5)
- interesse: nivel de interesse (baixo | médio | alto)
- sentimento: sentimento geral (positivo | neutro | negativo)
- proximo_passo: sugestão do próximo passo para o atendente
Responda APENAS com o JSON, sem markdown.`,
          },
          {
            role: "user",
            content: `Histórico do lead #${lead_id} (fonte: ${source === "whatsapp" ? "WhatsApp" : "notas CRM"}):\n\n${historyText.slice(0, 6000)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json().catch(() => ({}));
      return NextResponse.json({ error: "Erro OpenAI: " + (err?.error?.message || openaiRes.status) }, { status: 500 });
    }

    const openaiData = await openaiRes.json();
    let analysis;
    try {
      analysis = JSON.parse(openaiData.choices[0].message.content);
    } catch {
      analysis = { resumo: openaiData.choices[0].message.content };
    }

    return NextResponse.json({ lead_id, notes_count: messageCount, source, analysis });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro interno: " + (e?.message || "desconhecido") }, { status: 500 });
  }
}

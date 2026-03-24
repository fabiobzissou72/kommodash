import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export const maxDuration = 60;

async function fetchNotes(subdomain: string, token: string, leadId: number) {
  const pages = [];
  for (let page = 1; page <= 4; page++) {
    try {
      const res = await axios.get(
        `https://${subdomain}.kommo.com/api/v4/leads/${leadId}/notes?limit=250&page=${page}`,
        { headers: { Authorization: `Bearer ${token}` }, validateStatus: (s) => s < 500 }
      );
      const notes = res.data?._embedded?.notes || [];
      pages.push(...notes);
      if (notes.length < 250) break;
    } catch {
      break;
    }
  }
  return pages;
}

async function fetchContactPhone(subdomain: string, token: string, contactId: number): Promise<string | null> {
  try {
    const res = await axios.get(
      `https://${subdomain}.kommo.com/api/v4/contacts/${contactId}`,
      { headers: { Authorization: `Bearer ${token}` }, validateStatus: (s) => s < 500, timeout: 8000 }
    );
    const fields: any[] = res.data?.custom_fields_values || [];
    const phoneField = fields.find((f: any) => f.field_code === "PHONE");
    const phone = phoneField?.values?.[0]?.value;
    return phone || null;
  } catch {
    return null;
  }
}

async function fetchWhatsappHistory(phone: string): Promise<{ messages: { role: string; content: string }[]; count: number }> {
  const supabaseUrl = process.env.N8N_SUPABASE_URL;
  const supabaseKey = process.env.N8N_SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) return { messages: [], count: 0 };

  // Normaliza: remove +, espaços, traços
  const digits = phone.replace(/\D/g, "");

  try {
    const res = await axios.get(
      `${supabaseUrl}/rest/v1/n8n_chat_histories?session_id=like.*${digits}*&order=id.asc&limit=200`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        validateStatus: (s) => s < 500,
        timeout: 8000,
      }
    );
    const rows: any[] = res.data || [];
    const messages = rows
      .map((r: any) => {
        const msg = r.message;
        if (!msg?.content || !msg?.type) return null;
        // Remove JSON interno que o n8n adiciona no final das mensagens da IA
        const content = String(msg.content).replace(/\{[\s\S]*"proxima_etapa"[\s\S]*\}/g, "").trim();
        if (!content) return null;
        return { role: msg.type === "human" ? "Paciente" : "IA/Atendente", content };
      })
      .filter(Boolean) as { role: string; content: string }[];
    return { messages, count: messages.length };
  } catch {
    return { messages: [], count: 0 };
  }
}

export async function POST(req: NextRequest) {
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

  // Paraleliza: busca telefone + notas ao mesmo tempo
  const [phone, notes] = await Promise.all([
    contact_id ? fetchContactPhone(clean, token, contact_id) : Promise.resolve(null),
    fetchNotes(clean, token, lead_id),
  ]);

  // Tenta WhatsApp primeiro
  if (phone) {
    const { messages, count } = await fetchWhatsappHistory(phone);
    if (count > 0) {
      source = "whatsapp";
      messageCount = count;
      historyText = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    }
  }

  // Fallback: notas do Kommo
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
        const role =
          type === 10 ? "Paciente" :
          type === 12 ? "Atendente" :
          type === 4  ? "Sistema/IA" : "Sistema";
        const date = new Date(n.created_at * 1000).toLocaleString("pt-BR");
        return `[${date}] ${role}: ${text}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  // Chama GPT-4o mini
  const openaiRes = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
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
          content: `Histórico do lead #${lead_id} (fonte: ${source === "whatsapp" ? "conversa WhatsApp" : "notas do CRM"}):\n\n${historyText.slice(0, 6000)}`,
        },
      ],
    },
    {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      validateStatus: (s) => s < 600,
      timeout: 20000,
    }
  );

  if (openaiRes.status !== 200) {
    return NextResponse.json({ error: "Erro ao chamar OpenAI: " + openaiRes.data?.error?.message }, { status: 500 });
  }

  let analysis;
  try {
    const content = openaiRes.data.choices[0].message.content;
    analysis = JSON.parse(content);
  } catch {
    analysis = { resumo: openaiRes.data.choices[0].message.content };
  }

  return NextResponse.json({
    lead_id,
    notes_count: messageCount,
    source,
    analysis,
  });
}

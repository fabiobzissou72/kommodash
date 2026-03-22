import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

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

export async function POST(req: NextRequest) {
  const auth = req.cookies.get("auth");
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subdomain, token, lead_id } = await req.json();
  if (!subdomain || !token || !lead_id) {
    return NextResponse.json({ error: "Faltam campos obrigatórios" }, { status: 400 });
  }

  const clean = subdomain.replace(/^https?:\/\//, "").replace(/\.kommo\.com.*$/, "").trim();

  const notes = await fetchNotes(clean, token, lead_id);

  if (!notes.length) {
    return NextResponse.json({ error: "Nenhuma nota encontrada neste lead" }, { status: 404 });
  }

  // Monta o histórico formatado
  const history = notes
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

  // Chama GPT-4o mini
  const openaiRes = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      temperature: 0.3,
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
          content: `Histórico do lead #${lead_id}:\n\n${history.slice(0, 8000)}`,
        },
      ],
    },
    {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      validateStatus: (s) => s < 600,
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
    notes_count: notes.length,
    analysis,
  });
}

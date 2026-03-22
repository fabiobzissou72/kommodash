# Kommo Dashboard — Progresso

## O que foi feito
- Projeto Next.js criado em `C:/Users/fbzis/Downloads/kommo-dashboard`
- Login com usuário/senha (cookie httpOnly)
- Dashboard com gráficos: pizza, barra, linha 30 dias
- Múltiplas contas Kommo (troca por dropdown)
- Troca de pipeline dentro da conta
- Atualização automática a cada 60 segundos
- Build ok, pronto para deploy no Vercel

## Credenciais de acesso (`.env.local`)
- Usuário: `admin`
- Senha: `silvestre2025`

## Supabase — Histórico (PENDENTE)
URL: https://pzuegkugjidjktkazycv.supabase.co

### Próximos passos
1. Reiniciar VSCode para carregar MCP do Supabase
2. Criar tabela `kommo_snapshots` via MCP
3. Integrar `@supabase/supabase-js` no dashboard
4. Salvar snapshot diário automaticamente
5. Adicionar aba "Histórico" no dashboard com comparativos

### Tabela a criar
```sql
CREATE TABLE IF NOT EXISTS kommo_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_subdomain text NOT NULL,
  pipeline_id bigint NOT NULL,
  pipeline_name text,
  snapshot_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  today_leads int DEFAULT 0,
  today_won int DEFAULT 0,
  today_lost int DEFAULT 0,
  total_active int DEFAULT 0,
  total_won int DEFAULT 0,
  total_lost int DEFAULT 0,
  funnel jsonb,
  UNIQUE(account_subdomain, pipeline_id, snapshot_date)
);
```

## Deploy Vercel
- Repositório: criar novo no GitHub
- Variáveis de ambiente no Vercel:
  - `DASHBOARD_USER=admin`
  - `DASHBOARD_PASS=silvestre2025`
  - `SUPABASE_URL=https://pzuegkugjidjktkazycv.supabase.co`
  - `SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

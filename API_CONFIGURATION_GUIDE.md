# 📡 API Configuration Guide — JurysOne
**Complete Setup Instructions for All Services**
**Atualizado:** 06/04/2026

---

## 📋 Resumo Executivo

| Serviço | Status | Criticidade | Custo | Instalação |
|---------|--------|-------------|-------|-----------|
| PostgreSQL (Supabase) | ✅ Instalado | 🔴 Crítica | Grátis | Requer config |
| Redis (Upstash) | ✅ Instalado | 🟡 Importante | Grátis | Requer config |
| Google Gemini | ✅ Instalado | 🔴 Crítica | Grátis | Requer API key |
| Google Calendar | ✅ Instalado | 🟢 Opcional | Grátis | Requer OAuth |
| AWS S3 | ✅ Instalado | 🟢 Opcional | ~$1/mês | Requer credentials |
| Stripe | ✅ Instalado | 🟡 Importante | 2.9% + fees | Requer credentials |
| Resend Email | ✅ Instalado | 🟡 Importante | $20/mês | Requer API key |
| WhatsApp (Evolution) | ✅ Instalado | 🟢 Opcional | Variável | Requer token |
| DataJud | ✅ Instalado | 🟢 Opcional | Grátis | Requer API key |
| Socket.IO | ✅ Instalado | 🟡 Importante | Grátis | Pronto |
| Nodemailer | ✅ Instalado | 🟢 Opcional | Grátis | Requer SMTP |

**Total APIs:** 11 serviços
**Críticas (imprescindíveis):** 2 (PostgreSQL, Gemini)
**Importante (operacional):** 4 (Redis, Stripe, Resend, Socket.IO)
**Opcional (nice-to-have):** 5 (Google Calendar, S3, WhatsApp, DataJud, Nodemailer)

---

## 🔴 CRÍTICAS (Necessárias para Deploy Funcionar)

### 1. PostgreSQL + Supabase
**O quê:** Banco de dados relacional
**Onde:** https://app.supabase.com

**Setup (5 minutos):**
1. Crie conta em Supabase
2. Crie projeto novo:
   - Name: `jurysone`
   - Region: `sa-east-1` (São Paulo)
   - Password: Algo forte como `Jurysone@2024!Safe#123`
3. Settings → Database → Connection pooler
4. Copie Connection String com `?pgbouncer=true`

**Variáveis .env:**
```
DATABASE_URL=postgresql://...?pgbouncer=true
DIRECT_URL=postgresql://...
```

**Validação:**
```bash
psql "postgresql://..."  # Deve conectar
npm run db:seed         # Deve criar tabelas
```

**Status Atual:** ✅ Supabase criado, precisa ser preenchido com dados

---

### 2. Google Gemini 1.5 Flash (IA - NOVA REQUIREMENT)
**O quê:** API de IA para respostas do widget e análises
**Onde:** https://aistudio.google.com/app/apikey
**Custo:** Grátis (até 15k requests/dia, depois $0.075/1M tokens)

**Setup (2 minutos):**
1. Acesse https://aistudio.google.com/app/apikey
2. Clique "Create API Key in new Google Cloud project"
3. Copie a chave (começa com `AIza...`)
4. Adicione a .env

**Variável .env:**
```
GEMINI_API_KEY=AIza...
```

**Validação:**
```bash
curl -H "x-goog-api-key: AIza..." \
  "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent"
```

**Status Atual:** ❌ FALTANDO - Widget não responde sem isso

**Prioridade:** 🔥 Configure IMEDIATAMENTE

---

## 🟡 IMPORTANTES (Altamente Recomendado)

### 3. Redis (Cache & Job Queue)
**O quê:** Cache em memória + message broker para jobs
**Onde:** https://console.upstash.com (recomendado) ou Render Redis
**Custo:** Grátis (até 10k comandos/dia em Upstash)

**Setup (3 minutos com Upstash):**
1. Acesse https://console.upstash.com
2. Crie banco Redis novo
3. Copie UPSTASH_REDIS_REST_URL
4. Use como REDIS_URL (ou copie formato redis://)

**Variável .env:**
```
REDIS_URL=redis://default:password@host:port
```

**Alternativa (Render Redis):**
1. Render Dashboard → New → Redis
2. Render fornecerá Internal URL
3. Use como REDIS_URL

**Validação:**
```bash
redis-cli ping  # ou via curl se usando REST API
```

**Status Atual:** ❓ Configurado localmente, precisa em produção

---

### 4. Stripe (Pagamentos)
**O quê:** Processamento de pagamentos
**Onde:** https://dashboard.stripe.com
**Custo:** 2.9% + $0.30 por transação

**Setup (5 minutos):**
1. Crie conta em https://stripe.com
2. Dashboard → API Keys
3. Copie Secret Key (começa com `sk_live_`)
4. Webhooks → Adicione endpoint: `https://seu-dominio.com/webhooks/stripe`
5. Copie Webhook Secret (começa com `whsec_`)

**Variáveis .env:**
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Validação:**
```bash
curl -u sk_live_...: https://api.stripe.com/v1/charges
```

**Status Atual:** ✅ SDK instalado, precisa de credenciais

---

### 5. Resend (E-mail)
**O quê:** Serviço de envio de e-mail
**Onde:** https://resend.com
**Custo:** Grátis (100/dia) ou $20/mês para ilimitado

**Setup (3 minutos):**
1. Crie conta em https://resend.com
2. Vá para API Keys
3. Clique "Create API Key"
4. Copie chave (começa com `re_`)

**Variáveis .env:**
```
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@jurysone.com.br
```

**Validação:**
```bash
curl -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer re_..." \
  -H "Content-Type: application/json" \
  -d '{"from":"noreply@jurysone.com.br","to":"test@example.com","subject":"Test","html":"<p>Test</p>"}'
```

**Status Atual:** ✅ SDK instalado, precisa de API key

---

### 6. Socket.IO (Real-time Notifications)
**O quê:** WebSocket para atualizações em tempo real
**Onde:** Built-in no NestJS
**Custo:** Grátis
**Setup:** ✅ Já funciona, sem configuração extra

**Status Atual:** ✅ Pronto para uso

---

## 🟢 OPCIONAIS (Configure conforme Necessário)

### 7. Google Calendar Integration
**O quê:** Sincronizar audiências com Google Calendar
**Onde:** https://console.cloud.google.com
**Custo:** Grátis (Google Workspace pode ter limite)

**Setup (10 minutos):**
1. Acesse https://console.cloud.google.com
2. Crie projeto novo
3. Enable APIs:
   - Google Calendar API
   - Google+ API
4. Create OAuth 2.0 Client ID (tipo: Web application)
5. Adicione Authorized redirect URIs:
   - `http://localhost:3001/auth/google/callback` (dev)
   - `https://seu-dominio.com/auth/google/callback` (prod)
6. Copie Client ID e Secret

**Variáveis .env:**
```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://seu-dominio.com/auth/google/callback
```

**Status Atual:** ✅ SDK instalado, precisa de configuração

---

### 8. AWS S3 (Document Storage)
**O quê:** Armazenamento de documentos
**Onde:** https://console.aws.amazon.com
**Custo:** ~$1/mês para armazenamento básico

**Setup (10 minutos):**
1. Crie conta AWS
2. IAM → Create User → Attach Policy: `AmazonS3FullAccess`
3. Create Access Key (Security Credentials)
4. S3 → Create Bucket: `jurysone-documents`
5. Copie credentials

**Variáveis .env:**
```
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=jurysone-documents
```

**Status Atual:** ✅ SDK instalado, precisa de credenciais

---

### 9. WhatsApp Integration (Evolution API)
**O quê:** Receber/enviar mensagens WhatsApp
**Onde:** https://evolution-api.com ou self-hosted
**Custo:** Variável (~R$50-200/mês)

**Setup (15 minutos):**
1. Escolha provedor (Evolution, Twilio, etc.)
2. Configure webhook endpoint
3. Obtenha API token
4. Configure número WhatsApp Business

**Variáveis .env:**
```
WHATSAPP_API_TOKEN=...
WHATSAPP_API_URL=https://seu-servidor.com/api
```

**Status Atual:** ✅ SDK instalado, requer serviço externo

---

### 10. DataJud (Consulta de Processos Judiciais)
**O quê:** API pública do CNJ para dados judiciais
**Onde:** https://www.cnj.jus.br/programas-e-acoes/datajud
**Custo:** Grátis

**Setup (5 minutos):**
1. Acesse https://datajud-consultapublica.cnj.jus.br
2. Registre-se
3. Obtenha API key na área de desenvolvedor
4. Adicione .env

**Variável .env:**
```
DATAJUD_API_KEY=...
```

**Status Atual:** ✅ SDK instalado, precisa de API key

---

### 11. Nodemailer (E-mail Fallback)
**O quê:** Envio de e-mail alternativo via SMTP
**Onde:** Gmail, Outlook, custom SMTP
**Custo:** Grátis

**Setup (5 minutos):**
1. Crie email Gmail
2. Enable "App Passwords" (2FA ativo)
3. Gere "App Password"
4. Adicione .env

**Variáveis .env:**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=seu_app_password_16chars
```

**Status Atual:** ✅ SDK instalado, configuração opcional

---

## 🚀 Ordem de Implementação Recomendada

### Fase 1: Deploy Básico (Hoje)
1. ✅ Supabase (database)
2. ✅ Gemini API key
3. ✅ Redis (Upstash)
4. ✅ Deploy em Render

**Tempo:** 30 minutos
**Resultado:** Sistema funcional com IA

### Fase 2: Pagamentos (Semana 1)
5. Stripe (pagamentos)
6. Resend (e-mails transacionais)

**Tempo:** 15 minutos
**Resultado:** Monetização ativa

### Fase 3: Integrações (Semana 2)
7. Google Calendar
8. AWS S3
9. DataJud

**Tempo:** 30 minutos
**Resultado:** Recursos avançados

### Fase 4: Extras (Conforme Necessário)
10. WhatsApp
11. Nodemailer

---

## ✅ Checklist de Configuração

### Pré-Deploy
- [ ] PostgreSQL + Supabase criado
- [ ] GEMINI_API_KEY gerada e testada
- [ ] Redis (Upstash) configurado
- [ ] Todas 13 variáveis críticas preenchidas

### Deploy Render
- [ ] Repositório conectado
- [ ] Ambiente variables configuradas
- [ ] Build bem-sucedido
- [ ] Health check funcionando

### Pós-Deploy
- [ ] Database seed executado (`npm run db:seed`)
- [ ] Login funciona
- [ ] Widget de IA responde
- [ ] E-mails sendo enviados
- [ ] Logs sem erros críticos

### Produç
ão Completa
- [ ] Stripe webhooks funcionando
- [ ] Google Calendar sincronizando
- [ ] Backups automáticos ativados
- [ ] Monitoramento em Render

---

## 🔧 Troubleshooting por API

### Gemini não funciona
```
❌ Erro: "API_KEY_INVALID"
✅ Solução:
  1. Gere nova chave em aistudio.google.com
  2. Adicione quota de projeto
  3. Reinicie aplicação
```

### Redis não conecta
```
❌ Erro: "ECONNREFUSED"
✅ Solução:
  1. Verifique REDIS_URL em .env
  2. Upstash: Copie URL correta do painel
  3. Render: Use Internal URL, não Public
```

### Stripe webhook falha
```
❌ Erro: "Invalid signature"
✅ Solução:
  1. Copie Webhook Secret correto
  2. Adicione endpoint webhook em Stripe Dashboard
  3. Teste com: stripe trigger payment_intent.succeeded
```

---

## 📞 Contatos & Documentação

| Serviço | Docs | Status |
|---------|------|--------|
| Supabase | https://supabase.com/docs | ✅ Completo |
| Gemini | https://ai.google.dev | ✅ Completo |
| Redis/Upstash | https://upstash.com/docs | ✅ Completo |
| Stripe | https://stripe.com/docs/api | ✅ Completo |
| Resend | https://resend.com/docs | ✅ Completo |
| Google OAuth | https://developers.google.com/identity | ✅ Completo |
| AWS S3 | https://docs.aws.amazon.com/s3 | ✅ Completo |

---

**Status Geral:** ⚠️ Faltam apenas credenciais (APIs já estão no código)
**Ação Prioritária:** Configurar GEMINI_API_KEY antes de deploy

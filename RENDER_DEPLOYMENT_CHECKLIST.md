# 🚀 RENDER DEPLOYMENT — Checklist Completo
**Jurysone — SaaS Platform**
**Atualizado:** 06/04/2026

---

## 📌 PRÉ-REQUISITOS

- [ ] GitHub account e repositório `jurysone` sincronizado
- [ ] Supabase project criado com DATABASE_URL obtida
- [ ] Arquivo `.env.example` atualizado com todas as variáveis

---

## 🎯 PASSO 1: Conectar Repositório no Render

1. Acesse: https://dashboard.render.com/
2. Clique em **"New +"** → **"Web Service"**
3. Clique em **"Connect repository"**
4. Procure por repositório `jurysone` e clique **"Connect"**

**Configuração Básica:**
```
Service Name:    jurysone
Environment:     Node
Region:          São Paulo (sa-east-1)
Build Command:   npm run build
Start Command:   node dist/main
Root Directory:  jurysone-backend
```

---

## 🔐 PASSO 2: Configurar Variáveis de Ambiente (13 CRÍTICAS + 11 OPCIONAIS)

Vá para **Environment** → **Environment Variables** e adicione:

### 🔴 CRÍTICAS (Necessárias para deploy)

#### Node & Server
```
NODE_ENV=production
PORT=3001
```

#### Database (do Supabase)
```
DATABASE_URL=postgresql://postgres.xxxxx:SENHA@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxxxx:SENHA@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
```

> ℹ️ **Como obter:**
> 1. Supabase Dashboard → Your Project
> 2. Settings → Database
> 3. Connection Pooler (para DATABASE_URL) e Direct connection (para DIRECT_URL)
> 4. Copie as strings completas

#### JWT (Segurança)
```
JWT_SECRET=gere_uma_chave_aleatoria_de_32_chars
JWT_EXPIRES_IN=3600
```

> ℹ️ **Como gerar JWT_SECRET:**
> Execute no terminal: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

#### Frontend URL (CORS)
```
FRONTEND_URL=https://jurysone.onrender.com
```

> ℹ️ **Ajuste após deploy:** Render fornecerá uma URL como `https://jurysone-xxxxx.onrender.com`
> Substitua essa URL aqui

#### Supabase Storage
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ℹ️ **Como obter:**
> 1. Supabase Dashboard → Settings → API
> 2. Copie "Project URL" para SUPABASE_URL
> 3. Copie "Service Role key" para SUPABASE_SERVICE_KEY

#### IA - Google Gemini (ESSENCIAL para widget)
```
GEMINI_API_KEY=AIza...
```

> ℹ️ **Como obter:**
> 1. Acesse: https://aistudio.google.com/app/apikey
> 2. Clique "Create API Key"
> 3. Selecione project ou crie novo
> 4. Copie a chave gerada

#### E-mail (Resend)
```
RESEND_API_KEY=re_sua_chave_resend_aqui
EMAIL_FROM=noreply@jurysone.com.br
```

> ℹ️ **Como obter:**
> 1. Acesse: https://resend.com/api-keys
> 2. Clique "Create API Key"
> 3. Copie a chave

#### Redis (Cache & Job Queue)
```
REDIS_URL=redis://usuario:senha@host:porta
```

> ℹ️ **Opções:**
> - **LOCAL:** `redis://localhost:6379` (desenvolvimento)
> - **RENDER:** Crie Redis database no Render (console.log fornece URL)
> - **UPSTASH:** Crie em https://upstash.com (gratuito até 10k comandos)

---

### 🟡 OPCIONAIS (Recomendado para produção)

#### Google Calendar Integration
```
GOOGLE_CLIENT_ID=seu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_REDIRECT_URI=https://jurysone.onrender.com/auth/google/callback
```

> ℹ️ **Como obter:**
> 1. Acesse: https://console.cloud.google.com/
> 2. Crie projeto novo
> 3. Enable Google Calendar API
> 4. Create OAuth 2.0 Client ID
> 5. Add authorized redirect URI acima

#### AWS S3 (Documentos)
```
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=seu_access_key
AWS_SECRET_ACCESS_KEY=seu_secret_key
AWS_S3_BUCKET=jurysone-documents
```

#### Stripe (Pagamentos)
```
STRIPE_SECRET_KEY=sk_live_sua_chave
STRIPE_WEBHOOK_SECRET=whsec_sua_chave
```

#### WhatsApp Integration
```
WHATSAPP_API_TOKEN=seu_token
WHATSAPP_API_URL=https://seu_servidor.com.br
```

#### DataJud (Consulta de Processos)
```
DATAJUD_API_KEY=sua_chave
```

#### E-mail Fallback (Nodemailer)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_app_google
```

---

## ✅ PASSO 3: Deploy

1. Clique em **"Deploy"**
2. Aguarde a construção (3-5 minutos)
3. Verifique **"Logs"** → **"Build"** para erros

**Sucesso:** Você verá "Your service is live ✓"

---

## 🧪 PASSO 4: Validação Pós-Deploy

### Teste 1: Health Check
```bash
curl https://jurysone-xxxxx.onrender.com/api/health
```

Deve retornar:
```json
{"status":"ok","timestamp":1712432400000}
```

### Teste 2: Database Connection
```bash
# Abra o shell do Render (Dashboard → "Shell")
npm run db:seed
```

Deve criar usuários seed sem erros.

### Teste 3: Login
1. Abra: `https://jurysone-xxxxx.onrender.com/login.html`
2. Faça login com:
   - Email: `domingos.advss@gmail.com`
   - Senha: `Admin@JurysOne2024!`

### Teste 4: Widget de IA
1. Abra dashboard: `https://jurysone-xxxxx.onrender.com`
2. Procure pelo botão 🤖 no canto inferior direito
3. Clique e teste enviando uma mensagem
4. Verifique se a IA responde (requer GEMINI_API_KEY)

---

## 🔍 TROUBLESHOOTING

### ❌ Build falha: "P1002: Can't reach database"
**Causa:** DATABASE_URL incorreta
**Solução:**
1. Copie DATABASE_URL novamente do Supabase
2. Verifique se tem `?pgbouncer=true` no final
3. Garanta que a senha está correta (sem caracteres escapados errados)

### ❌ Deploy muda para "Failed": "GEMINI_API_KEY not provided"
**Causa:** Variável de ambiente não configurada
**Solução:** Adicione GEMINI_API_KEY em Environment Variables

### ❌ Login não funciona: "JWT verification failed"
**Causa:** JWT_SECRET diferente entre Render e Supabase
**Solução:** Regenere JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Atualize em Render e faça deploy novamente.

### ❌ Widget de IA não responde
**Causa:** GEMINI_API_KEY inválida ou expirada
**Solução:**
1. Gere nova chave em https://aistudio.google.com/app/apikey
2. Atualize GEMINI_API_KEY em Render
3. Redeploy

### ⚠️ Render muda para "suspended" ou "building" constantemente
**Causa:** Plano Free tem limite de 750 horas/mês; redeploys consomem
**Solução:**
- Upgrade para plano pago
- Ou: Configure CI/CD para fazer deploy apenas na branch `main`

---

## 📊 Monitoramento Contínuo

### Checklist de Saúde
Periodicamente verifique:

- [ ] Render Dashboard → Logs (sem erros "500")
- [ ] Métricas → CPU e RAM (não deve estar em 100%)
- [ ] Supabase Dashboard → Database Logs (sem conexões falhadas)
- [ ] Stripe Dashboard → Webhooks (todos recebidos?)
- [ ] Gmail/Resend → E-mails enviados?

### Escalabilidade
Se notar lentidão:
1. **Redis:** Aumente tamanho da instância Upstash
2. **Database:** Optimize queries em Supabase Analytics
3. **Render:** Upgrade para instância maior

---

## 🎉 Checklist Final

- [ ] Render conectado ao GitHub
- [ ] Todas as 13 variáveis críticas configuradas
- [ ] Health check respondendo
- [ ] Database seed executado
- [ ] Login funcionando
- [ ] Widget de IA respondendo
- [ ] Logs sem erros críticos
- [ ] Custom domain configurado (opcional)
- [ ] Backups automáticos do Supabase ativados
- [ ] Alertas de erro configurados

---

## 📞 Próximas Ações

1. **Configurar Domínio:** Se tem `jurysone.com.br`, vá para Render Settings → Custom Domain
2. **SSL/HTTPS:** Render configura automaticamente com Let's Encrypt
3. **Backups:** Supabase → Settings → Backups → Enable Weekly Backups
4. **Monitoramento:** Render → Alerts → Create para erros > 5/min

---

**Status:** ✅ Pronto para Produção
**Último Deploy:** [Data do seu deploy]
**Próxima Revisão:** [Data em 30 dias]

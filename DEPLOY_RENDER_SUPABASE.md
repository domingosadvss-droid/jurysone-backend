# JurysOne - Deployment no Render + Supabase

## 🚀 Guia Completo de Deploy Seguro

---

## PARTE 1: PREPARAR REPOSITÓRIO GIT

### 1.1 Adicionar Remote Repository

```bash
cd /path/to/jurysone

# Se ainda não tem remote, adicione:
git remote add origin https://github.com/seu-usuario/jurysone.git

# Verificar remote
git remote -v
# Origin: https://github.com/seu-usuario/jurysone.git
```

### 1.2 Push para GitHub/GitLab

```bash
# Primeiro push (main/master branch)
git push -u origin main

# Ou se a branch é 'master':
git push -u origin master

# Verificar status
git log --oneline | head -5
# Deve mostrar o commit de security hardening
```

---

## PARTE 2: CONFIGURAR NO RENDER

### 2.1 Conectar Repositório no Render

```
1. Dashboard Render → New → Web Service
2. Select Repository → Authorize GitHub/GitLab
3. Choose: jurysone repository
4. Branch: main (ou sua branch padrão)
```

### 2.2 Configurar Environment Variables

**⚠️ CRÍTICO: Adicionar TODOS os secrets**

```
Settings → Environment → Add Variable

# JWT Secrets (GERADOS E ÚNICOS)
JWT_SECRET=20cd74e1cd984ed137674685546c7d38b5cb95d9d077da94215af4cba3fcdfe5
JWT_PORTAL_SECRET=a10ffe7bc8e4feb395c6b891c118bb5a14c84224b9140dc45a29ba1e18c15ae6
JWT_REFRESH_SECRET=53210b5441e8fb1bccd12f856060b5e23a4c09c3edb4f70383630e0a8337a0ea
JURYSONE_WEBHOOK_SECRET=8fcfe0dd34d38ffb8cfd88cd0eb80c5a60b13a9a645f53f96a40cc9476970844

# Database (do Supabase)
DATABASE_URL=postgresql://postgres.xxxxx:password@db.xxxxx.supabase.co:5432/postgres?schema=public
DIRECT_URL=postgresql://postgres.xxxxx:password@db.xxxxx.supabase.co:5432/postgres

# Supabase Storage
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ... (service role key - NUNCA expor)
SUPABASE_ANON_KEY=eyJ... (safe para frontend)

# Node & Frontend
NODE_ENV=production
FRONTEND_URL=https://app.jurysone.com.br (ou seu domínio)

# Integrações (manter do ambiente anterior)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
ZAPSIGN_WEBHOOK_TOKEN=xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
ASAAS_WEBHOOK_TOKEN=xxxxx
PAGARME_WEBHOOK_SECRET=xxxxx
GEMINI_API_KEY=AIzaxxxxx (se tiver)
```

### 2.3 Build Command

```
Settings → Build Command

npm run build
```

### 2.4 Start Command

```
Settings → Start Command

sh -c "npx prisma migrate deploy --schema jurysone-backend/src/database/schema.prisma && node jurysone-backend/dist/main.js"
```

**OU se Dockerfile existe:**

```
Settings → Runtime
Select: Docker
```

---

## PARTE 3: SUPABASE - VALIDAR MIGRAÇÕES

### 3.1 Acessar Supabase Console

```
https://supabase.com/dashboard
Select seu projeto
SQL Editor
```

### 3.2 Verificar Migrations Rodadas

```sql
-- Verificar if migrations table exists
SELECT * FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 10;

-- Deve retornar as migrações aplicadas
-- Coluna 'finished_at' deve ter data (não NULL)
```

### 3.3 Verificar Schema Criado

```sql
-- Listar todas as tabelas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Deve incluir: usuario, escritorio, processo, documento, etc
```

### 3.4 Validar Índices (Security Check)

```sql
-- Verificar index no escritorioId
SELECT * FROM pg_indexes
WHERE tablename = 'processo'
AND indexname LIKE '%escritorio%';

-- Esperado: pelo menos 1 índice em escritorioId
```

---

## PARTE 4: DEPLOY NO RENDER

### 4.1 Iniciar Deploy

```
Dashboard Render → Web Service
Manual Deploy → Deploy latest commit

OU: Git push automático fará deploy
```

### 4.2 Monitorar Logs

```
Durante o deploy:

✓ "Building Docker image..."
✓ "Installing dependencies..."
✓ "Generating Prisma client..."
✓ "Compiling TypeScript..."
✓ "Starting service..."

Logs específicos:
✓ "Prisma schema loaded successfully"
✓ "Prisma migration(s) applied successfully"
✓ "JurysOne API rodando em http://localhost:3001/api"
✓ "🔒 Ambiente: PRODUCTION (Swagger desabilited)"
```

### 4.3 Verificar se deployou

```bash
# Testar health endpoint
curl https://api.jurysone.com.br/api/health

# Esperado:
# { "status": "ok", "timestamp": 1234567890 }
```

---

## PARTE 5: VALIDAÇÃO DE SEGURANÇA PÓS-DEPLOY

### 5.1 Verificar Secrets Carregados

```bash
# (Render logs devem mostrar)
# ✓ JWT_SECRET loaded
# ✓ JWT_PORTAL_SECRET loaded
# Se não mostrar = erro crítico
```

### 5.2 Rodar Security Tests

```bash
bash SECURITY_TESTS.sh https://api.jurysone.com.br

# Esperado: Todos os 5 testes passam ✓
```

### 5.3 Testar Webhooks

```bash
# 1. Webhook com secret inválido = 401
curl -X POST https://api.jurysone.com.br/webhooks/assinatura \
  -H "x-jurysone-secret: WRONG_SECRET" \
  -d '{"status":"signed","document_id":"test","signer_name":"Test"}'
# Expected: 401 Unauthorized

# 2. Webhook com secret correto = 200
curl -X POST https://api.jurysone.com.br/webhooks/assinatura \
  -H "x-jurysone-secret: 8fcfe0dd34d38ffb8cfd88cd0eb80c5a60b13a9a645f53f96a40cc9476970844" \
  -d '{"status":"signed","document_id":"test","signer_name":"Test"}'
# Expected: 200 OK (ou processo)
```

### 5.4 Verificar Swagger Desabilited

```bash
# Deve retornar 404
curl -I https://api.jurysone.com.br/api/docs

# Expected: HTTP/1.1 404 Not Found
```

---

## PARTE 6: CHECKLIST FINAL

### Antes do Deploy

```
☐ Commit com security hardening feito
☐ Git pushed para o repositório
☐ Todos os 4 JWT secrets gerados e únicos
☐ DATABASE_URL e DIRECT_URL configurados
☐ SUPABASE_SERVICE_KEY e ANON_KEY configurados
☐ FRONTEND_URL configurado corretamente
☐ NODE_ENV=production definido
☐ Build command correto no Render
☐ Start command com migrations incluído
```

### Durante o Deploy

```
☐ Logs mostram "Prisma migration(s) applied successfully"
☐ Logs mostram "JurysOne API rodando em..."
☐ Logs mostram "🔒 Ambiente: PRODUCTION"
☐ Build completou com sucesso (não há errors)
☐ Service status = "Live" (verde) no Render
```

### Após o Deploy

```
☐ Health endpoint retorna 200
☐ Security tests passam (bash SECURITY_TESTS.sh)
☐ Webhook com secret inválido retorna 401
☐ /api/docs retorna 404 (Swagger disabled)
☐ Database migrations aplicadas no Supabase
☐ Nenhum erro nos logs (ler últimos 50 linhas)
☐ Testar login/register funcionando
☐ Testar refresh token funcionando
```

---

## TROUBLESHOOTING

### "Prisma migration failed"

**Causa:** DIRECT_URL incorreto ou não configurado

```bash
# Solução:
1. Verificar DIRECT_URL = conexão direta (sem PgBouncer)
2. Test connection:
   psql $DIRECT_URL -c "SELECT 1;"
3. Redeploy no Render
```

### "JWT_SECRET undefined"

**Causa:** Variáveis não foram adicionadas ao Render

```bash
# Solução:
1. Ir para Render → Settings → Environment
2. Confirmar que JWT_SECRET está lá
3. Manual redeploy (ou push novo commit)
```

### "Cannot connect to database"

**Causa:** DATABASE_URL ou network issue

```bash
# Solução:
1. Verificar Supabase status (status.supabase.com)
2. Testar connection string no psql
3. Render pode precisar de IP whitelist no Supabase
   (Settings → Network → Allow all IPs)
```

### "/api/docs ainda está acessível em produção"

**Causa:** NODE_ENV não é 'production' ou código antigo

```bash
# Verificar:
1. Render logs: procurar "🔒 Ambiente: PRODUCTION"
2. Confirmar NODE_ENV=production está set
3. Verificar que src/main.ts tem a condicional if (!isProduction)
4. Fazer manual redeploy (force rebuild)
```

---

## MONITORAMENTO CONTÍNUO

### Daily (Diariamente)

```bash
# Verificar saúde da API
curl https://api.jurysone.com.br/api/health

# Verificar últimas linhas de log
# Render Dashboard → Logs (procurar por 500 errors)
```

### Weekly (Semanalmente)

```bash
# Rodar security tests
bash SECURITY_TESTS.sh https://api.jurysone.com.br

# Verificar database size
# Supabase → Database → Usage

# Revisar error logs
```

### Monthly (Mensalmente)

```bash
# Rotar secrets (se necessário)
# Update dependencies (npm audit)
# Review performance metrics (Render Analytics)
```

---

## ROLLBACK EM CASO DE PROBLEMA

### Se o deploy quebrou tudo:

```bash
# Opção 1: Rollback no Render
1. Dashboard → Deployments
2. Selecionar deployment anterior
3. Click "Rollback"

# Opção 2: Revert git commit
git revert HEAD
git push origin main
# Render fará redeploy automaticamente
```

---

## PRÓXIMOS PASSOS

1. ✅ **Fazer commit** (já feito)
2. ⏭️ **Git push** para o repositório
3. ⏭️ **Configurar secrets** no Render
4. ⏭️ **Redeploy** no Render
5. ⏭️ **Validar** com security tests
6. ⏭️ **Monitorar** logs para erros

---

**Tempo estimado:** 15-30 minutos
**Risco:** Baixo (todas as mudanças são backward-compatible)
**Rollback:** Rápido (< 5 min com Render)

---

Pronto para fazer o deploy? Avise quando tiver configurado os secrets e vou guiar pelo resto! 🚀

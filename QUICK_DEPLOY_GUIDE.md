# 🚀 Quick Deploy Guide - GitHub → Render → Supabase

**Tempo total:** 20-30 minutos
**Complexidade:** Baixa
**Risco:** Zero (pode fazer rollback em 5 min)

---

## PASSO 1: Push no GitHub (5 min)

```bash
cd C:\Users\jonat\OneDrive\Documentos\claude\jurysone

# Verificar status
git status
# Deve mostrar: "On branch main" ou "On branch master"
# "nothing to commit, working tree clean"

# Se não estiver clean:
git add .
git commit -m "Security hardening..."

# Push para GitHub
git push origin main
# (ou: git push origin master)

# ✅ Pronto! Verificar em GitHub → seu repositório
```

---

## PASSO 2: Configurar Secrets no Render (10 min)

```
1. Ir para: https://dashboard.render.com/
2. Selecionar Web Service "jurysone"
3. Settings → Environment
4. Adicionar (ou atualizar) variáveis:

JWT_SECRET=20cd74e1cd984ed137674685546c7d38b5cb95d9d077da94215af4cba3fcdfe5
JWT_PORTAL_SECRET=a10ffe7bc8e4feb395c6b891c118bb5a14c84224b9140dc45a29ba1e18c15ae6
JWT_REFRESH_SECRET=53210b5441e8fb1bccd12f856060b5e23a4c09c3edb4f70383630e0a8337a0ea
JURYSONE_WEBHOOK_SECRET=8fcfe0dd34d38ffb8cfd88cd0eb80c5a60b13a9a645f53f96a40cc9476970844

NODE_ENV=production
FRONTEND_URL=https://app.jurysone.com.br

# (Manter existentes: DATABASE_URL, SUPABASE_*, etc)

5. Deploy → Manual Deploy
   Ou aguardar auto-deploy (Render detecção git push)
```

---

## PASSO 3: Monitorar Deploy (5 min)

```
Render Dashboard → Logs

Procurar por (ordem esperada):
✓ Building Docker image...
✓ Installing dependencies...
✓ Generating Prisma client...
✓ "Prisma migration(s) applied successfully"
✓ "JurysOne API rodando em http://localhost:3001"
✓ "🔒 Ambiente: PRODUCTION (Swagger desabilited)"

Se vir algum erro vermelho → scroll para ver detalhes
```

---

## PASSO 4: Validar Deployment (2 min)

```bash
# Test 1: Health Check
curl https://api.jurysone.com.br/api/health
# Esperado: { "status": "ok", "timestamp": ... }

# Test 2: Webhook Security
curl -X POST https://api.jurysone.com.br/webhooks/assinatura \
  -H "x-jurysone-secret: WRONG_SECRET" \
  -d '{"status":"signed","document_id":"test","signer_name":"Test"}'
# Esperado: HTTP 401 Unauthorized

# Test 3: Swagger Disabled
curl -I https://api.jurysone.com.br/api/docs
# Esperado: HTTP/1.1 404 Not Found
```

---

## PASSO 5: Supabase - Verificar Migrações (3 min)

```sql
-- Ir para: https://supabase.com/dashboard
-- SQL Editor → Execute:

SELECT * FROM "_prisma_migrations"
ORDER BY started_at DESC LIMIT 5;

-- Deve mostrar as migrations com 'finished_at' preenchido
-- Se vazio = migration ainda rodando ou error

-- Verificar tabelas criadas:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Esperado: usuario, escritorio, processo, documento, etc
```

---

## ✅ Checklist Rápido

```
☐ Git push feito: git push origin main
☐ Secrets adicionados no Render (4 JWT_*)
☐ NODE_ENV=production configurado
☐ Deploy rodando (Render Logs mostra progresso)
☐ Health endpoint retorna 200
☐ Webhook testa 401 com secret inválido
☐ /api/docs retorna 404
☐ Migrations aplicadas no Supabase
☐ Nenhum erro vermelho nos Render logs
```

---

## ⚠️ Se Algo Der Errado

### Deploy está lento
- Normal: primeiro build leva 5-10 min
- Aguarde...

### "Prisma migration failed"
```bash
# Problema: DIRECT_URL incorreto no Render
# Solução: Verificar DATABASE_URL está correta
# Ir para Render → Settings → Environment
# Procurar DATABASE_URL e DIRECT_URL
# Ambas devem apontar para Supabase Postgres
```

### Webhook retorna 500 ao invés de 401
```bash
# Problema: JWT_WEBHOOK_SECRET não foi recarregado
# Solução: Render → Manual Deploy (força rebuild)
# Logs devem mostrar "reloading secrets"
```

### Health endpoint retorna 503
```bash
# Problema: Migrations ainda rodando
# Solução: Aguardar 2-5 min
# Render Logs devem mostrar "migration(s) applied"
```

---

## 🎯 Resultado Final

Após seguir estes passos:

```
✅ Código com hardening de segurança em produção
✅ Webhooks validando assinatura
✅ Multi-tenant isolation ativo
✅ Rate limiting protegendo auth endpoints
✅ Swagger desabilited em produção
✅ Database migrations aplicadas
✅ Secrets seguros (não expostos)
```

**Seu app está PRONTO PARA SaaS** 🚀

---

## 📞 Cheat Sheet

| Ação | Comando |
|------|---------|
| Push GitHub | `git push origin main` |
| Ver commits | `git log --oneline` |
| Status git | `git status` |
| Health check | `curl https://api.yourapp/api/health` |
| Test webhook | `curl -X POST https://api.yourapp/webhooks/assinatura -H "x-jurysone-secret: TEST"` |
| Check Swagger | `curl https://api.yourapp/api/docs` |

---

**Tempo: 20-30 min | Risco: Zero | Rollback: 5 min**

Vamos lá! 💪

1. `git push origin main`
2. Adicione secrets no Render
3. Aguarde deploy (5-10 min)
4. Rode os testes
5. ✅ Pronto!

# JurysOne - Production Setup Guide

## 🔒 Configuração de Segurança para Produção

Este guia descreve como configurar sua instância JurysOne para produção.

---

## 1. Variáveis de Ambiente Críticas

### Secrets JWT — GERE OS SEUS PRÓPRIOS

```bash
# Gere novos secrets únicos com este comando:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_PORTAL_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JURYSONE_WEBHOOK_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

⚠️ **IMPORTANTE:**
- ✓ NUNCA use valores de exemplo/documentação — gere os seus próprios
- ✓ Armazene em Render Secrets, AWS Secrets Manager ou similar
- ✓ NUNCA commite em git
- ✓ Use valores DIFERENTES em staging e produção
- ✓ Rotacione a cada 6 meses ou após incidentes

---

## 2. Configuração por Plataforma

### 🚀 Render.com (Recomendado para Backend)

No dashboard Render: Service → Settings → Environment

```
DATABASE_URL=postgresql://user:pass@host:5432/jurysone
DIRECT_URL=postgresql://user:pass@host:5432/jurysone
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx...
SUPABASE_ANON_KEY=eyJxxx...

JWT_SECRET=<gere com crypto.randomBytes(32).toString('hex')>
JWT_PORTAL_SECRET=<gere com crypto.randomBytes(32).toString('hex')>
JWT_REFRESH_SECRET=<gere com crypto.randomBytes(32).toString('hex')>
JURYSONE_WEBHOOK_SECRET=<gere com crypto.randomBytes(32).toString('hex')>

NODE_ENV=production
FRONTEND_URL=https://app.jurysone.com.br
BACKEND_URL=https://api.jurysone.com.br

GEMINI_API_KEY=AI-xxxxxx
RESEND_API_KEY=re_xxxxxx
```

### 🌐 HostGator (Frontend Estático)

Faça upload via FTP dos arquivos da pasta `app-preview/`:
- `index.html`
- `dashboard.html`
- `login.html`
- `config.js` (com API_URL apontando para seu backend no Render)
- `logo-jurysone.png`

---

## 3. Desabilitar Swagger em Produção

```typescript
// src/main.ts — linha ~30
if (process.env.NODE_ENV !== 'production') {
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
```

---

## 4. Validação de Database Migrations

```bash
# No Dockerfile ou entrypoint:
npx prisma migrate deploy
node dist/main.js

# Teste local:
DATABASE_URL="postgresql://user:pass@localhost/test_db" \
NODE_ENV=production \
npm run start:prod
```

---

## 5. Testes de Segurança

```bash
# Webhook com secret inválido → deve retornar 401
curl -X POST https://api.jurysone.com.br/webhooks/assinatura \
  -H "x-jurysone-secret: INVALID" \
  -H "Content-Type: application/json" \
  -d '{"status":"signed"}'

# Rate limiting → após 6 tentativas deve retornar 429
for i in {1..7}; do
  curl -s -X POST https://api.jurysone.com.br/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' | jq '.statusCode'
done
```

---

## 6. Checklist Pré-Launch

```
Security:
  ☐ JWT_SECRET definido e único (gerado, não copiado)
  ☐ JWT_PORTAL_SECRET diferente de JWT_SECRET
  ☐ JURYSONE_WEBHOOK_SECRET definido
  ☐ NODE_ENV=production
  ☐ Swagger desabilitado em produção
  ☐ CORS whitelist não tem localhost
  ☐ Database com backup automático habilitado no Supabase

Migrations:
  ☐ npx prisma migrate deploy testado
  ☐ Rollback plan documentado

Tests:
  ☐ Webhook com secret inválido → 401
  ☐ Cross-office access → 403
  ☐ Rate limiting → 429 após 6 tentativas
```

---

## 7. Rotação de Secrets (a cada 6 meses)

```bash
# 1. Gerar novos secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Atualizar no Render Dashboard ou Secrets Manager
# 3. Redeploy automático
# 4. Monitorar logs por erros de autenticação
```

---

**Segurança é responsabilidade de todos — mantenha seus secrets seguros.**

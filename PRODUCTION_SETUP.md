# JurysOne - Production Setup Guide

## 🔒 Configuração de Segurança para Produção

Este guia descreve como configurar sua instância JurysOne para produção com todas as medidas de segurança.

---

## 1. Variáveis de Ambiente Críticas

### Secrets JWT (GERADOS - NÃO COMPARTILHAR)

```bash
# Copie EXATAMENTE estes valores para seu ambiente de produção
# Cada secret é único e deve ser mantido seguro

JWT_SECRET=20cd74e1cd984ed137674685546c7d38b5cb95d9d077da94215af4cba3fcdfe5
JWT_PORTAL_SECRET=a10ffe7bc8e4feb395c6b891c118bb5a14c84224b9140dc45a29ba1e18c15ae6
JWT_REFRESH_SECRET=53210b5441e8fb1bccd12f856060b5e23a4c09c3edb4f70383630e0a8337a0ea
JURYSONE_WEBHOOK_SECRET=8fcfe0dd34d38ffb8cfd88cd0eb80c5a60b13a9a645f53f96a40cc9476970844
```

**⚠️ IMPORTANTE:**
- ✓ Armazene em AWS Secrets Manager, Render Secrets, ou similar
- ✓ NUNCA commite em git
- ✓ Rotacione a cada 6 meses ou após incidentes
- ✓ Use valores DIFERENTES em staging e produção
- ✗ NUNCA compartilhe com desenvolvedores (apenas via CI/CD)

---

## 2. Configuração por Plataforma

### 🚀 Render.com (Recomendado)

```bash
# 1. No dashboard Render, vá para: Service → Settings → Environment
# 2. Adicione estas variáveis:

DATABASE_URL=postgresql://user:pass@host:5432/jurysone
DIRECT_URL=postgresql://user:pass@host:5432/jurysone
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx... (nunca expor)
SUPABASE_ANON_KEY=eyJxxx... (seguro para frontend)

JWT_SECRET=20cd74e1cd984ed137674685546c7d38b5cb95d9d077da94215af4cba3fcdfe5
JWT_PORTAL_SECRET=a10ffe7bc8e4feb395c6b891c118bb5a14c84224b9140dc45a29ba1e18c15ae6
JWT_REFRESH_SECRET=53210b5441e8fb1bccd12f856060b5e23a4c09c3edb4f70383630e0a8337a0ea
JURYSONE_WEBHOOK_SECRET=8fcfe0dd34d38ffb8cfd88cd0eb80c5a60b13a9a645f53f96a40cc9476970844

NODE_ENV=production
FRONTEND_URL=https://app.jurysone.com.br
BACKEND_URL=https://api.jurysone.com.br

# Integrações
ZAPSIGN_WEBHOOK_TOKEN=seu_token_zapsign
STRIPE_WEBHOOK_SECRET=whsec_xxxxxx
ASAAS_WEBHOOK_TOKEN=seu_token_asaas
PAGARME_WEBHOOK_SECRET=seu_secret_pagarme

GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
GEMINI_API_KEY=AI-xxxxxx
```

### 🐳 Docker/AWS ECS

```bash
# Usar AWS Secrets Manager
aws secretsmanager create-secret --name jurysone-prod --secret-string file://secrets.json

# No Docker Compose ou ECS, referenciar:
environment:
  - JWT_SECRET=${JWT_SECRET}
  - JWT_PORTAL_SECRET=${JWT_PORTAL_SECRET}
  # etc...
```

### 🔐 Railway.app

Mesma configuração do Render - usar Variables na aba Settings.

---

## 3. Desabilitar Swagger em Produção

### Arquivo: `src/main.ts`

```typescript
// Linha ~30, modificar:

if (process.env.NODE_ENV !== 'production') {
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
```

Isso desabilita `/api/docs` automaticamente quando `NODE_ENV=production`.

---

## 4. Validação de Database Migrations

### Verificar se migrations rodam automaticamente

```bash
# 1. No seu Dockerfile, confirme que existe:
RUN npx prisma migrate deploy

# 2. Ou no entrypoint script:
#!/bin/bash
npx prisma migrate deploy
node dist/main.js
```

### Teste local:

```bash
# Simular produção
DATABASE_URL="postgresql://user:pass@localhost/test_db" \
NODE_ENV=production \
npm run start:prod

# Verificar logs de migration
docker logs <container-id> | grep -i "migrate\|prisma"
```

---

## 5. Testes de Segurança Críticos

### 5.1 Testar Webhooks (401 com secret inválido)

```bash
# ✗ Deve retornar 401
curl -X POST https://api.jurysone.com.br/webhooks/assinatura \
  -H "Content-Type: application/json" \
  -H "x-jurysone-secret: INVALID_SECRET" \
  -d '{
    "status": "signed",
    "document_id": "doc-123",
    "signer_name": "João Silva"
  }'

# Esperado: { "statusCode": 401, "message": "Invalid webhook secret" }

# ✓ Deve retornar 200 com secret correto
curl -X POST https://api.jurysone.com.br/webhooks/assinatura \
  -H "Content-Type: application/json" \
  -H "x-jurysone-secret: 8fcfe0dd34d38ffb8cfd88cd0eb80c5a60b13a9a645f53f96a40cc9476970844" \
  -d '{
    "status": "signed",
    "document_id": "doc-123",
    "signer_name": "João Silva"
  }'
```

### 5.2 Testar Multi-Tenant Isolation (403 cross-office)

```bash
# Token User A (office-1)
TOKEN_A="eyJhbGc..."

# Tentar acessar documento de office-2
curl -X GET https://api.jurysone.com.br/api/documentos/doc-999 \
  -H "Authorization: Bearer $TOKEN_A"

# Esperado: { "statusCode": 403, "message": "Você não tem permissão..." }
```

### 5.3 Testar Rate Limiting (429 após 6 tentativas)

```bash
# Script para testar login rate limiting
for i in {1..7}; do
  echo "Tentativa $i:"
  curl -s -X POST https://api.jurysone.com.br/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "wrong"
    }' | jq '.statusCode, .message'
  sleep 1
done

# Esperado na 6ª: 401 "Email ou senha inválidos"
# Esperado na 7ª: 429 "Too Many Requests"
```

---

## 6. Checklist Pré-Launch

```
Security:
  ☐ JWT_SECRET definido e único
  ☐ JWT_PORTAL_SECRET definido e diferente de JWT_SECRET
  ☐ JURYSONE_WEBHOOK_SECRET definido
  ☐ Todos os secrets armazenados em Secrets Manager
  ☐ NODE_ENV=production
  ☐ Swagger desabilited em produção
  ☐ CORS whitelist não tem localhost
  ☐ Database com backup automático

Migrations:
  ☐ npx prisma migrate deploy testado localmente
  ☐ Migrations executam corretamente no deploy
  ☐ Rollback plan documentado

Tests:
  ☐ Webhook com secret inválido retorna 401 ✓
  ☐ Cross-office access retorna 403 ✓
  ☐ Login rate limiting bloqueia após 6 tentativas ✓
  ☐ Portal JWT_PORTAL_SECRET é obrigatório ✓
  ☐ Refresh token com user inativo falha ✓

Monitoring:
  ☐ Error tracking (Sentry/DataDog)
  ☐ Log aggregation (CloudWatch/Render logs)
  ☐ Uptime monitoring
  ☐ Database backup schedule
```

---

## 7. Rotação de Secrets (a cada 6 meses)

```bash
# 1. Gerar novos secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# 2. Atualizar em Secrets Manager
aws secretsmanager update-secret --secret-id jurysone-prod --secret-string ...

# 3. Redeploy automático (Render redeploy)
# 4. Monitorar logs por erros de auth
# 5. Comunicar a time
```

---

## 8. Suporte e Troubleshooting

### "Token inválido" em testes manuais
- Verificar JWT_SECRET está correto
- Confirmar token não expirou (7 dias padrão)

### Webhooks retornando 401
- Confirmar JURYSONE_WEBHOOK_SECRET está nos headers
- Validar com: `echo -n $JURYSONE_WEBHOOK_SECRET | wc -c` (deve ser 64 caracteres)

### Migrations não rodando
- Verificar DIRECT_URL está configurado (para migrations)
- Logs: `docker logs <container> | grep prisma`

---

**Enviado com ❤️ por JurysOne Security Team**

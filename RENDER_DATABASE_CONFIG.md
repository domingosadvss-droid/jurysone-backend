# Configuração de Banco de Dados no Render

## Variáveis de Ambiente Obrigatórias

O Prisma ORM requer DUAS variáveis de ambiente para funcionar corretamente com Supabase:

### 1. DATABASE_URL (Conexão com Pooling)
Usada para conexões normais da aplicação (melhor para múltiplas conexões simultâneas)

```
postgresql://postgres:32nCJ6AAkNDpVgL7@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Componentes:**
- Host: `aws-1-sa-east-1.pooler.supabase.com`
- Porta: `6543` (pooling)
- Usuario: `postgres`
- Senha: `32nCJ6AAkNDpVgL7`
- Database: `postgres`
- pgbouncer: `true` (ativa connection pooling)

### 2. DIRECT_URL (Conexão Direta)
Usada para migrações de banco de dados e operações que requerem conexão direta

```
postgresql://postgres:32nCJ6AAkNDpVgL7@db.ulxjhespeseceemntwtj.supabase.co:5432/postgres
```

**Componentes:**
- Host: `db.ulxjhespeseceemntwtj.supabase.co`
- Porta: `5432` (conexão direta)
- Usuario: `postgres`
- Senha: `32nCJ6AAkNDpVgL7`
- Database: `postgres`

## Como Configurar no Render

1. Acesse o dashboard do Render
2. Vá para o serviço `jurysone-backend`
3. Navegue para a aba `Environment`
4. Clique em `Edit`
5. Adicione/atualize as seguintes variáveis:

| Chave | Valor |
|-------|-------|
| `DATABASE_URL` | `postgresql://postgres:32nCJ6AAkNDpVgL7@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | `postgresql://postgres:32nCJ6AAkNDpVgL7@db.ulxjhespeseceemntwtj.supabase.co:5432/postgres` |

6. Clique em salvar
7. Redeploy o serviço

## Schema Prisma

A configuração está definida em `src/database/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

## Status Atual

- ✅ Docker build funcionando
- ✅ Prisma client generation funcionando
- ⏳ Aguardando configuração de ambiente no Render
- ⏳ Teste de conexão com banco de dados

## Próximos Passos

1. Configurar as duas variáveis de ambiente no Render
2. Fazer deploy/restart do serviço
3. Verificar logs para confirmar conectividade
4. Testar endpoints da API

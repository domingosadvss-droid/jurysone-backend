# JurysOne - Database Migration Validation

## ✓ Configuração Atual

### Dockerfile
```dockerfile
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy --schema src/database/schema.prisma && node dist/main"]
```

**Status:** ✓ Migrations rodam automaticamente antes de iniciar a aplicação

---

## Validação Local (Pre-Production)

### 1. Testar migrações em desenvolvimento

```bash
# Limpar banco de dados de teste
DATABASE_URL="postgresql://user:password@localhost:5432/test_db" \
npx prisma migrate reset --force

# Executar migrations from scratch
DATABASE_URL="postgresql://user:password@localhost:5432/test_db" \
npx prisma migrate deploy

# Verificar schema foi criado
DATABASE_URL="postgresql://user:password@localhost:5432/test_db" \
npx prisma db push --skip-generate
```

### 2. Simular startup de produção

```bash
# Build Docker image
docker build -t jurysone:latest .

# Executar container com database de teste
docker run -e DATABASE_URL="postgresql://user:pass@localhost:5432/test_db" \
           -e NODE_ENV=production \
           jurysone:latest

# Verificar logs
docker logs <container-id> | grep -i "migrate\|prisma\|database"
```

### 3. Verificar integridade do schema

```bash
# Gerar relatório de schema
DATABASE_URL="postgresql://..." npx prisma db execute --stdin < check_schema.sql

# Ou via psql
psql -h localhost -U user -d jurysone_db
\dt  -- list all tables
\d <table_name> -- describe table
```

---

## Production Deployment Checklist

### Render.com

```bash
# 1. Configurar DATABASE_URL e DIRECT_URL em Settings → Environment

# 2. No deploy log, verificar:
#    ✓ "Prisma schema loaded successfully"
#    ✓ "Prisma migration(s) applied successfully"
#    ✓ "API running on port 3001"

# 3. Testar conexão
curl https://api.yourapp.com/api/health
# Esperado: { "status": "ok", "timestamp": 12345 }
```

### AWS ECS / Docker

```bash
# 1. Confirmar que DATABASE_URL + DIRECT_URL estão em Secrets Manager

# 2. Task definition com environment variables:
{
  "environment": [
    {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:..."},
    {"name": "DIRECT_URL", "valueFrom": "arn:aws:secretsmanager:..."},
    {"name": "NODE_ENV", "value": "production"}
  ]
}

# 3. Verificar logs do container
aws logs tail /ecs/jurysone --follow | grep -i migrate
```

---

## Troubleshooting

### "Migrations failed to apply"

```bash
# 1. Verificar conexão ao database
DATABASE_URL="postgresql://..." npx prisma db pull

# 2. Verificar status de migrações
DATABASE_URL="postgresql://..." npx prisma migrate status

# 3. Ver arquivo de migration mais recente
ls -la src/database/migrations/ | tail -5

# 4. Reverter última migration se necessário (dev only)
DATABASE_URL="postgresql://..." npx prisma migrate resolve --rolled-back "timestamp_description"
```

### "Connection timeout"

```bash
# 1. Verificar DIRECT_URL está configurado (migrações usam direct connection)
echo $DIRECT_URL

# 2. Teste de conectividade
psql $DIRECT_URL -c "SELECT 1;"

# 3. Se usar PgBouncer, confirmar que DIRECT_URL aponta para conexão direta
# (PgBouncer não suporta Prisma migrations)
```

### "Prisma query engine not found"

```bash
# 1. Dockerfile já tem a configuração:
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

# 2. Se erro persistir, verificar OpenSSL version:
openssl version
# Esperado: OpenSSL 3.0.x ou OpenSSL 1.1.1

# 3. Reconstruir image se necessário
docker build --no-cache -t jurysone:latest .
```

---

## Rollback Plan

### Prisma não suporta "revert" automático

Se uma migration quebrou a produção:

```bash
# Opção 1: Reverter a migration manualmente (se reversível)
1. Comentar a migration problemática em src/database/migrations/
2. Executar npx prisma migrate resolve --rolled-back <migration_name>
3. Deploy versão anterior do código

# Opção 2: Database restore (recomendado)
1. Restaurar backup pré-migration
2. Fazer deploy com código anterior
3. Investigar issue em staging
4. Re-aplicar migration após fix
```

---

## Migration Best Practices

1. **Sempre testar em staging primeiro**
   ```bash
   DATABASE_URL="postgresql://staging_db" npm run start
   ```

2. **Grandes migrations devem ser divididas**
   - Não fazer ALTER TABLE ... ADD COLUMN + DROP COLUMN na mesma migration
   - Usar "expand/contract" pattern para zero-downtime

3. **Documentar migrations complexas**
   ```sql
   -- migration: add_user_status_field
   -- reason: tracking user activation status
   -- risk: if default not set, existing records will be NULL
   -- rollback: DROP COLUMN user.status
   ```

4. **Backup antes de grandes changes**
   ```bash
   pg_dump $DATABASE_URL > backup_before_migration.sql
   ```

---

## Monitoring Migrations in Production

### CloudWatch / Render Logs

```bash
# Filtrar apenas migration logs
logs tail --filter "Prisma\|migrate\|migration"

# Alertar se migration falha
if grep -q "Error\|Failed" logs; then
  send_alert("Database migration failed in production!")
fi
```

### Health Check

```bash
# O health endpoint `/api/health` confirma que:
# 1. Server iniciou
# 2. Migrations rodaram
# 3. Database connection está OK

curl https://api.yourapp.com/api/health
# Se 200 + { "status": "ok" } → migrations sucesso!
```

---

**Última atualização:** April 2026
**Responsável:** Security Team
**Próxima revisão:** Quarterly

# Jurysone — Sistema de Gestão Jurídica

Plataforma SaaS de gestão jurídica para escritórios de advocacia brasileiros, desenvolvida com arquitetura moderna e IA integrada.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 + React 19 + Tailwind CSS |
| Backend | NestJS + TypeScript |
| Banco de Dados | PostgreSQL 16 + pgvector |
| Cache / Filas | Redis 7 + BullMQ |
| IA | OpenAI GPT-4o + Embeddings |
| Auth | JWT + Refresh Token (httpOnly cookie) |
| ORM | Prisma |
| Deploy | Docker + AWS ECS Fargate |

## Início Rápido

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/jurysone.git
cd jurysone

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas chaves

# 3. Suba os containers
docker-compose up --build

# 4. Acesse
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
# Swagger Docs: http://localhost:3001/api/docs
```

## Variáveis de Ambiente (.env)

```env
DB_PASS=jurysone_dev
JWT_SECRET=seu_jwt_secret_aqui
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
NEXTAUTH_SECRET=seu_nextauth_secret
```

## Estrutura do Projeto

```
jurysone/
├── docker-compose.yml          # Orquestração de containers
├── jurysone-frontend/          # Next.js 15
│   ├── app/
│   │   ├── (auth)/             # Login, Cadastro
│   │   └── (dashboard)/        # Área autenticada
│   ├── components/
│   ├── hooks/
│   └── lib/api.ts              # Cliente HTTP com auto-refresh
└── jurysone-backend/           # NestJS
    └── src/
        ├── modules/
        │   ├── auth/            # Autenticação JWT
        │   ├── processes/       # Gestão de processos
        │   ├── clients/         # CRM Jurídico
        │   ├── financial/       # Financeiro
        │   ├── ai/              # Copiloto Jurídico IA
        │   └── ...
        └── database/
            └── schema.prisma   # Schema completo
```

## Módulos Principais

- **Processos**: CRUD, filtros, paginação, andamentos, documentos
- **Clientes**: CRM jurídico PF/PJ, histórico completo
- **Financeiro**: Honorários, despesas, DRE, cobranças
- **Agenda**: Prazos, audiências, eventos com alertas automáticos
- **Tarefas**: Kanban, prioridades, assignamento de equipe
- **Documentos**: Upload S3, versionamento, assinatura digital
- **Copiloto IA**: Análise de processos, geração de petições, análise de risco
- **Relatórios**: PDF/Excel assíncronos com exportação

## Roadmap

- [x] MVP: Auth, Processos, Clientes, Agenda
- [ ] Módulo Financeiro completo
- [ ] Copiloto IA (GPT-4o)
- [ ] Integração CNJ/DataJud
- [ ] App Mobile (React Native)
- [ ] Marketplace de Templates
- [ ] White-label

---

Desenvolvido com Next.js 15 · NestJS · PostgreSQL · Redis · OpenAI

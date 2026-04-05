# 🚀 JurysOne — Roadmap para 100% em Produção
**Data:** 29/03/2026
**Objetivo:** Colocar o sistema 100% online em `jurysone.com.br` com Supabase, sócios, advogados parceiros e clientes

---

## 📋 DIAGNÓSTICO ATUAL DO SISTEMA

### ✅ O que já existe
- Backend NestJS completo com 20+ módulos (processos, clientes, agenda, financeiro, IA, eSign, WhatsApp, relatórios, CRM, parceiros, portal do cliente, etc.)
- Frontend Next.js 15 com todas as páginas do dashboard
- Schema Prisma completo (30+ modelos de banco de dados)
- Docker Compose configurado
- Arquivos `.env` com todas as variáveis mapeadas
- Sistema de autenticação JWT com refresh token
- WebSocket (Socket.io) para notificações em tempo real
- Integração com Google Calendar, DataJud, WhatsApp, OpenAI, Stripe, ZapSign, AWS S3

### ❌ O que está FALTANDO (causa dos problemas)

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **Dockerfiles ausentes** (backend e frontend) | Sistema não sobe via Docker |
| 2 | **`next.config.js` ausente** | Frontend não compila |
| 3 | **`tailwind.config.js` ausente** | CSS do sistema não funciona |
| 4 | **`tsconfig.json` do frontend ausente** | TypeScript não compila |
| 5 | **Dependências do frontend incompletas** | axios, tailwindcss, @types faltando |
| 6 | **Banco de dados não migrado** | Usando PostgreSQL local, precisa ir para Supabase |
| 7 | **Nenhuma API key configurada** | Todos os serviços com chaves em branco |
| 8 | **Sem deploy em produção** | Sistema só roda localmente |
| 9 | **Domínio não comprado** | `jurysone.com.br` precisa ser registrado |
| 10 | **SSL/HTTPS não configurado** | Site não seguro para produção |

---

## 🗺️ FASES DE IMPLEMENTAÇÃO

---

## FASE 1 — Correções de Código (Sem custo)

### TAREFA 1 — Criar Dockerfiles do Backend e Frontend

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne, um sistema de gestão jurídica.
Preciso que você crie os Dockerfiles que estão FALTANDO no projeto.

Stack:
- Backend: NestJS + TypeScript (pasta jurysone-backend)
- Frontend: Next.js 15 + React 19 (pasta jurysone-frontend)

Crie:
1. /jurysone-backend/Dockerfile — imagem de produção multi-stage com Node 20 Alpine, build NestJS, expose porta 3001
2. /jurysone-frontend/Dockerfile — imagem de produção multi-stage com Node 20 Alpine, build Next.js standalone, expose porta 3000
3. /jurysone-backend/.dockerignore — excluir node_modules, dist, .env
4. /jurysone-frontend/.dockerignore — excluir node_modules, .next, .env

O docker-compose.yml já existe e referencia esses Dockerfiles.
Use boas práticas: multi-stage build, non-root user, health checks.
Salve os arquivos nas pastas corretas.
```

---

### TAREFA 2 — Criar configurações do Frontend (next.config, tailwind, tsconfig)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. O frontend em Next.js 15 está com TRÊS arquivos de configuração faltando.
Preciso que você os crie.

Informações do projeto:
- Framework: Next.js 15 + React 19
- Pasta do frontend: jurysone-frontend/
- O projeto usa Tailwind CSS (classes estão no código mas tailwind não está configurado)
- Usa TypeScript com path alias @/ apontando para a raiz
- API backend em http://localhost:3001 (dev) e https://api.jurysone.com.br (prod)
- Tem imagens do S3/Supabase

Crie:
1. jurysone-frontend/next.config.ts — com: output standalone (para Docker), rewrites de /api para backend, domínios de imagem permitidos (supabase, amazonaws)
2. jurysone-frontend/tailwind.config.ts — com: content paths para app/ e components/, tema personalizado azul jurídico (primary: #0f2d5e), dark mode class
3. jurysone-frontend/tsconfig.json — com: target ES2020, strict mode, path aliases (@/* → ./*), suporte a JSX

Também atualize jurysone-frontend/package.json adicionando as devDependencies faltantes:
- tailwindcss, autoprefixer, postcss
- typescript, @types/react, @types/react-dom, @types/node
- eslint, eslint-config-next

E crie jurysone-frontend/postcss.config.js.

Salve todos os arquivos na pasta correta.
```

---

### TAREFA 3 — Corrigir dependências do Frontend

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. O frontend usa axios em lib/api.ts mas ele NÃO está no package.json.
Preciso que você corrija as dependências.

Analise os arquivos do frontend em jurysone-frontend/ e:

1. Liste todas as importações usadas nos arquivos .tsx/.ts que não estão no package.json
2. Atualize o package.json adicionando TODAS as dependências faltantes:
   - axios (usado em lib/api.ts)
   - @tanstack/react-query (para gerenciamento de estado do servidor)
   - zustand (provavelmente usado nas stores/)
   - lucide-react (ícones)
   - react-hot-toast ou sonner (notificações)
   - date-fns (já existe — confirmar)
   - recharts (para gráficos do dashboard)
   - socket.io-client (para WebSocket com o backend)

3. Crie jurysone-frontend/app/layout.tsx (raiz) se não existir, com: html lang="pt-BR", Providers wrapper, globals.css import

4. Execute: npm install na pasta jurysone-frontend

Salve os arquivos e me mostre o resultado do npm install.
```

---

### TAREFA 4 — Criar módulos faltantes no Backend (controllers/modules sem arquivo module.ts)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne (NestJS). Vários módulos têm controller e service mas estão FALTANDO o arquivo .module.ts, o que impede o sistema de compilar.

Analise a pasta jurysone-backend/src/modules/ e:

1. Para cada pasta que tem controller.ts e service.ts mas NÃO tem module.ts, crie o arquivo module.ts correspondente
2. Verifique se todos os módulos estão importados em jurysone-backend/src/app.module.ts
3. Corrija quaisquer importações circulares ou faltantes no AppModule

Módulos que provavelmente precisam de .module.ts criado:
- ai/ (ai-copilot.controller.ts existe mas sem ai.module.ts)
- analytics/
- atividades/
- automacoes/
- clientes/
- configuracoes/
- contatos/
- crm/
- dashboard/
- datajud/
- documentos/
- esign/
- financeiro/
- modelos/
- notifications/ (verificar)
- prazos/
- processes/
- processos/
- relatorios/
- status-flow/
- tarefas/
- timetracking/
- webhooks/
- whatsapp/

Após criar os modules, tente compilar: npm run build na pasta jurysone-backend.
Me mostre todos os erros de compilação para corrigirmos.
```

---

## FASE 2 — Banco de Dados no Supabase (Gratuito — Free tier)

### TAREFA 5 — Configurar Supabase e migrar banco de dados

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso migrar o banco de dados PostgreSQL local para o Supabase.

O projeto usa Prisma ORM com o schema em jurysone-backend/src/database/schema.prisma.

Me ajude passo a passo:

ETAPA 1 — Criar conta Supabase:
- Acesse https://supabase.com e crie uma conta gratuita
- Crie um novo projeto chamado "jurysone"
- Região: South America (São Paulo)
- Anote: Project URL, anon key, service_role key, DATABASE_URL (direct) e DIRECT_URL (pooler)

ETAPA 2 — Atualizar o schema Prisma para Supabase:
Edite jurysone-backend/src/database/schema.prisma e atualize:
- datasource db: adicione directUrl = env("DIRECT_URL") para usar o connection pooler do Supabase
- Verifique se usa extensões como pgvector (o docker usa pgvector/pgvector:pg16)

ETAPA 3 — Criar arquivo .env.production com as variáveis do Supabase:
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROJECT-REF]:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres

ETAPA 4 — Rodar a migração:
cd jurysone-backend
DATABASE_URL="[URL_SUPABASE]" npx prisma migrate deploy --schema src/database/schema.prisma

ETAPA 5 — Verificar as tabelas criadas no Supabase Dashboard

Me guie em cada etapa e corrija eventuais erros do Prisma migrate.
```

---

### TAREFA 6 — Configurar Row Level Security (RLS) no Supabase para multi-tenant

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne, um SaaS jurídico multi-tenant.
O sistema tem o conceito de "Office" (escritório), e cada escritório só pode ver seus próprios dados.

Preciso configurar Row Level Security (RLS) no Supabase para isolar os dados de cada escritório.

Contexto:
- O modelo Office é o tenant raiz
- Todos os modelos (Process, Client, Task, etc.) têm um campo officeId
- Autenticação é JWT próprio do NestJS (não usa Supabase Auth)
- O JWT do Jurysone tem o campo officeId no payload

Faça:
1. Ative RLS em todas as tabelas que têm officeId
2. Crie políticas RLS usando o claim JWT: current_setting('request.jwt.claims', true)::jsonb->>'officeId'
3. Para tabelas sem officeId (como User que tem officeId), crie policies via JOIN
4. Crie uma função PostgreSQL helper: get_current_office_id() para reutilizar nas policies
5. Gere o SQL completo para rodar no Supabase SQL Editor

Tabelas principais para proteger:
- "Process", "Client", "Task", "CalendarEvent", "Document", "Payment", "Notification", "AuditLog", "EsignEnvelope", "WhatsappMessage", "Automacao", etc.

Mostre o SQL completo e explique cada policy.
```

---

## FASE 3 — APIs Externas (Algumas gratuitas, outras pagas)

### TAREFA 7 — Configurar DataJud CNJ (GRATUITO — monitoramento judicial oficial)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso ativar a integração com o DataJud (API oficial do CNJ — GRATUITA).

A chave pública do DataJud é: cDZHYzlZa0JadVREZDJCendFbXNBR3A1
URL base: https://api-publica.datajud.cnj.jus.br

O serviço já existe em jurysone-backend/src/modules/datajud/datajud.service.ts

Faça:
1. Leia o arquivo datajud.service.ts e datajud.controller.ts
2. Complete a implementação dos métodos:
   - buscarPorNumero(numeroProcesso, tribunal): busca processo pelo número
   - buscarPorParte(nomeParte, tribunal): busca processos de uma pessoa
   - listarTribunais(): lista tribunais disponíveis
   - sincronizarProcesso(processoId): busca andamentos e atualiza no banco
3. Adicione agendamento (CRON) para sincronizar automaticamente processos ativos a cada 6h
4. Adicione no .env: DATAJUD_API_KEY=cDZHYzlZa0JadVREZDJCendFbXNBR3A1 e DATAJUD_BASE_URL=https://api-publica.datajud.cnj.jus.br

Teste a integração buscando o processo fictício número 0001234-56.2024.8.26.0100 no TJSP.
```

---

### TAREFA 8 — Configurar OpenAI (Copiloto Jurídico IA)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso ativar o Copiloto Jurídico com IA (OpenAI GPT-4o).

Já tenho os arquivos:
- jurysone-backend/src/modules/ai/ai.service.ts
- jurysone-backend/src/modules/ai/ai-copilot.service.ts
- jurysone-backend/src/modules/ai/ai-copilot.controller.ts

Faça:
1. Leia esses arquivos e complete os métodos que estão vazios ou com TODO
2. Implemente as funções:
   - analisarProcesso(processoId): análise de risco 0-100, pontos atenção, próximos passos
   - gerarMinuta(tipo, dados): gerar petições/contratos como minutas editáveis
   - resumirMovimentacoes(movimentacoes[]): resumo em português claro
   - classificarDocumento(textoOCR): classificar tipo de documento jurídico
   - sugerirPrazos(processo): sugerir prazos processuais baseado na fase
3. Use o modelo gpt-4o para análises complexas e gpt-4o-mini para classificações simples
4. Adicione no .env: OPENAI_API_KEY=sk-proj-SUA_CHAVE_AQUI
   (Para obter: https://platform.openai.com/api-keys)
5. Adicione rate limiting: máximo 50 req/minuto por escritório
6. Salve histórico de interações no banco (tabela AiInteraction já existe no schema)

Custo estimado: ~R$50-200/mês dependendo do uso.
```

---

### TAREFA 9 — Configurar Asaas (Pagamentos PIX/Boleto — Recomendado Brasil)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso ativar cobranças automáticas de honorários via Asaas (PIX + Boleto + Cartão).

O Asaas é gratuito para se cadastrar, cobra por transação.
Conta sandbox: https://sandbox.asaas.com
Conta produção: https://www.asaas.com

Os arquivos já existem em:
- jurysone-backend/src/modules/financeiro/financeiro.service.ts
- jurysone-backend/src/modules/financeiro/financeiro.controller.ts
- jurysone-backend/src/modules/webhooks/webhooks.controller.ts

Faça:
1. Leia esses arquivos
2. Implemente integração completa com Asaas:
   - criarCliente(clienteJurysone): sincroniza cliente no Asaas
   - gerarCobranca(honorario): cria boleto/PIX/cartão
   - consultarStatus(gatewayId): verifica status do pagamento
   - cancelarCobranca(gatewayId): cancela cobrança
   - processarWebhook(payload): atualiza status no banco ao receber confirmação
3. Adicione no .env:
   ASAAS_API_KEY=$aact_SEU_TOKEN_SANDBOX (sandbox) ou $aact_SEU_TOKEN_PROD (produção)
   ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3 (mudar para produção depois)
4. Configure o endpoint de webhook em /api/webhooks/asaas
5. Adicione automação: quando pagamento confirmado → emitir NFS-e + notificar WhatsApp

Documentação: https://asaasv3.docs.apiary.io
Para criar conta teste: https://sandbox.asaas.com/cadastro
```

---

### TAREFA 10 — Configurar ZapSign (Assinatura Digital de Contratos)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso ativar assinatura digital de contratos via ZapSign.

ZapSign: 100% brasileiro, validade jurídica (MP 2.200-2), planos a partir de R$49/mês.
Trial gratuito disponível em: https://app.zapsign.com.br

Os arquivos existem em:
- jurysone-backend/src/modules/esign/esign.service.ts
- jurysone-backend/src/modules/esign/esign.controller.ts

Faça:
1. Leia esses arquivos
2. Implemente o fluxo completo:
   - criarEnvelope(documento, signatarios[]): cria documento para assinatura
   - adicionarSignatario(envelopeToken, dados): adiciona pessoa para assinar
   - consultarStatus(envelopeToken): verifica se foi assinado
   - reenviarLembrete(signatarioToken): reenvia email/WhatsApp
   - processarWebhook(payload): ao receber "doc_signed", baixar PDF assinado, salvar no S3/Supabase Storage, notificar advogado
3. Adicione no .env:
   ZAPSIGN_API_TOKEN=SEU_TOKEN_AQUI (obter em: app.zapsign.com.br → Configurações → API)
   ZAPSIGN_BASE_URL=https://api.zapsign.com.br/api/v1

4. Configure webhook em: /api/webhooks/zapsign
   (Registrar no painel ZapSign → URL do webhook)

Fluxo esperado:
Novo Atendimento → Gerar Contrato PDF → Upload Storage → Criar Envelope ZapSign →
Enviar link por WhatsApp/Email → Receber webhook assinado → Salvar PDF assinado
```

---

### TAREFA 11 — Configurar Armazenamento de Documentos (Supabase Storage — Gratuito)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso configurar armazenamento de documentos.

Vou usar o SUPABASE STORAGE (gratuito até 1GB, depois ~$0.021/GB) em vez do AWS S3 para simplificar.
O Supabase Storage tem API compatível com S3.

Os arquivos existem em:
- jurysone-backend/src/modules/documentos/documentos.service.ts

Faça:
1. Configure o Supabase Storage:
   - Crie os buckets no Supabase Dashboard: "documentos", "contratos", "assinados", "avatars"
   - Configure policies de acesso (apenas usuários autenticados com JWT podem acessar)

2. Atualize documentos.service.ts para usar o Supabase Storage SDK:
   npm install @supabase/supabase-js --prefix jurysone-backend

3. Implemente:
   - uploadDocumento(file, path, officeId): upload com path organizado por escritório
   - gerarUrlAssinada(path): URL temporária para download seguro (expire: 1h)
   - deletarDocumento(path): remover documento
   - listarDocumentos(processoId): listar arquivos de um processo

4. Adicione no .env:
   SUPABASE_URL=https://SEU_PROJECT.supabase.co
   SUPABASE_SERVICE_KEY=eyJ... (service_role key — nunca expor no frontend!)
   SUPABASE_ANON_KEY=eyJ... (anon key — pode usar no frontend)

5. Estrutura de pastas no bucket:
   documentos/{officeId}/{clienteId}/{processoId}/arquivo.pdf
   contratos/{officeId}/{clienteId}/contrato-YYYY-MM.pdf
   assinados/{officeId}/{envelopeId}/contrato-assinado.pdf
   avatars/{officeId}/{userId}/avatar.jpg

Mantenha o código compatível com AWS S3 para migração futura se necessário.
```

---

### TAREFA 12 — Configurar Email Transacional (Resend — Gratuito até 3.000/mês)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso configurar envio de emails transacionais via Resend.

Resend: gratuito até 3.000 emails/mês. Cadastro: https://resend.com

O backend já tem nodemailer e resend como dependências no package.json.
Os arquivos existem em:
- jurysone-backend/src/modules/notifications/notifications.service.ts

Faça:
1. Crie conta em https://resend.com e obtenha a API key
2. Configure o domínio jurysone.com.br no Resend (adicionar registros DNS quando o domínio for comprado)
3. Implemente em notifications.service.ts:
   - enviarBoasVindas(usuario): email de boas-vindas com credenciais
   - notificarPrazoFatal(advogado, processo, prazo): alerta de prazo fatal
   - notificarAssinaturaRequisitada(cliente, envelopeUrl): link para assinar contrato
   - notificarPagamentoConfirmado(cliente, valor): confirmação de pagamento
   - notificarNovaIntimacao(advogado, processo): nova movimentação no DataJud
   - enviarRelatorioSemanal(socios, dados): relatório gerencial todo domingo 8h

4. Adicione no .env:
   RESEND_API_KEY=re_SUA_CHAVE_AQUI
   EMAIL_FROM=noreply@jurysone.com.br
   EMAIL_FROM_NAME=JurysOne — Gestão Jurídica

5. Crie templates HTML profissionais para cada tipo de email
6. Por enquanto use: EMAIL_FROM=onboarding@resend.dev (enquanto o domínio não estiver configurado)

Cadastro: https://resend.com/signup
Documentação: https://resend.com/docs
```

---

### TAREFA 13 — Configurar WhatsApp (Evolution API — Gratuito, self-hosted)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso configurar envio de mensagens WhatsApp automáticas via Evolution API (gratuita, open-source).

Os arquivos existem em:
- jurysone-backend/src/modules/whatsapp/whatsapp.service.ts
- jurysone-backend/src/modules/whatsapp/whatsapp.controller.ts

Opção 1 — Evolution API (GRATUITA, self-hosted com Docker):
- GitHub: https://github.com/EvolutionAPI/evolution-api
- Roda em Docker, sem custo de API

Adicione ao docker-compose.yml:
  evolution-api:
    image: atendai/evolution-api:latest
    ports:
      - 8080:8080
    environment:
      - AUTHENTICATION_API_KEY=jurysone_evolution_key
    volumes:
      - evolution_data:/evolution/instances

Faça:
1. Adicione o serviço Evolution API ao docker-compose.yml
2. Implemente em whatsapp.service.ts:
   - criarInstancia(escritorioId): criar instância do WhatsApp para o escritório
   - obterQRCode(instancia): retornar QR Code para conectar o WhatsApp
   - verificarConexao(instancia): verificar se está conectado
   - enviarTexto(para, mensagem, instancia): enviar mensagem de texto
   - enviarArquivo(para, url, nome, instancia): enviar documento PDF
   - enviarLinkPagamento(para, link, valor, instancia): enviar link de cobrança
3. Adicione no .env:
   EVOLUTION_API_URL=http://localhost:8080
   EVOLUTION_API_KEY=jurysone_evolution_key

4. Crie endpoint /api/whatsapp/qrcode/{escritorioId} para o advogado conectar o WhatsApp
5. Automações prontas:
   - Ao gerar boleto → enviar link WhatsApp
   - Ao cadastrar novo cliente → enviar boas-vindas
   - D-3 de prazo → lembrete para o advogado
```

---

## FASE 4 — Deploy em Produção

### TAREFA 14 — Deploy do Backend no Railway (Gratuito para começar)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso fazer o deploy do backend NestJS em produção.

Vou usar o Railway.app (trial grátis, depois ~$5/mês para o hobby plan).

Stack do backend:
- NestJS + TypeScript
- Conecta ao Supabase PostgreSQL (já configurado)
- Redis (Railway oferece Redis)
- Porta 3001

Faça:
1. Verifique se o Dockerfile do backend está correto (criado na Tarefa 1)
2. Crie o arquivo jurysone-backend/railway.json:
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": { "startCommand": "node dist/main", "healthcheckPath": "/api/health" }
}

3. Adicione endpoint de health check em jurysone-backend/src/main.ts:
   GET /api/health → retorna { status: "ok", timestamp: Date.now() }

4. Crie jurysone-backend/Procfile (backup para Heroku-style):
   web: node dist/main

5. Gere o arquivo de variáveis de ambiente para o Railway:
   (Lista todas as variáveis do .env que devem ser configuradas no Railway Dashboard)

6. Me mostre os comandos para:
   a) Instalar Railway CLI: npm install -g @railway/cli
   b) Login: railway login
   c) Criar projeto: railway init
   d) Deploy: railway up
   e) Adicionar Redis: railway add --plugin redis
   f) Configurar domínio customizado: api.jurysone.com.br

Documentação: https://docs.railway.app
Cadastro: https://railway.app
```

---

### TAREFA 15 — Deploy do Frontend na Vercel (GRATUITO)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso fazer o deploy do frontend Next.js 15 na Vercel.

A Vercel é GRATUITA para projetos pessoais/pequenos.

Stack do frontend:
- Next.js 15 + React 19
- Consome a API do backend em https://api.jurysone.com.br
- Tem a pasta jurysone-frontend/

Faça:
1. Verifique se o next.config.ts está configurado corretamente para produção (criado na Tarefa 2)

2. Crie jurysone-frontend/vercel.json:
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "env": {
    "NEXT_PUBLIC_API_URL": "https://api.jurysone.com.br",
    "NEXTAUTH_URL": "https://jurysone.com.br"
  }
}

3. Crie jurysone-frontend/.env.production.local:
NEXT_PUBLIC_API_URL=https://api.jurysone.com.br
NEXTAUTH_URL=https://jurysone.com.br

4. Me mostre os comandos para:
   a) Instalar Vercel CLI: npm install -g vercel
   b) Login: vercel login
   c) Deploy de preview: vercel
   d) Deploy de produção: vercel --prod
   e) Configurar domínio: vercel domains add jurysone.com.br

5. Liste todas as variáveis de ambiente que devem ser configuradas no Vercel Dashboard

6. Configure redirects: www.jurysone.com.br → jurysone.com.br

Cadastro gratuito: https://vercel.com
```

---

## FASE 5 — Domínio e DNS

### TAREFA 16 — Comprar e Configurar o Domínio jurysone.com.br

**Cole este prompt em uma nova conversa do Claude:**

```
Preciso comprar e configurar o domínio jurysone.com.br para o sistema JurysOne.

Guia completo:

PASSO 1 — Comprar o domínio:
- Acesse https://registro.br (Registro oficial de domínios .com.br — R$40/ano)
- Busque: jurysone.com.br
- Se disponível, registre com seus dados pessoais/CNPJ
- Certifique-se que o email para contato está correto (necessário para validação)

PASSO 2 — Configurar registros DNS:
Após comprar, configure os seguintes registros DNS no painel do Registro.br:

Para o FRONTEND (Vercel):
  Tipo A   → @     → 76.76.21.21 (IP da Vercel)
  Tipo A   → www   → 76.76.21.21
  Tipo CNAME → www → cname.vercel-dns.com

Para o BACKEND (Railway):
  Tipo CNAME → api → SEU-APP.railway.app

Para EMAIL (Resend):
  Tipo TXT → @ → "v=spf1 include:spf.resend.com -all"
  Tipo MX  → @ → feedback-smtp.us-east-1.amazonses.com (prioridade 10)
  Tipo TXT → resend._domainkey → DKIM fornecido pelo Resend

PASSO 3 — Verificar propagação DNS:
- Use: https://dnschecker.org para verificar se propagou (pode levar até 48h)

PASSO 4 — Configurar SSL:
- Vercel: SSL automático ✅
- Railway: SSL automático ✅
- Supabase: SSL automático ✅

Me mostre um resumo de todos os registros DNS necessários em formato de tabela.
```

---

## FASE 6 — Portal do Cliente e Acesso de Parceiros

### TAREFA 17 — Ativar Portal do Cliente (acesso para clientes e advogados parceiros)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso ativar o Portal do Cliente, que permite:
1. Clientes acessarem seus processos, documentos e honorários
2. Advogados Parceiros acessarem casos onde são indicados

Os arquivos já existem:
- jurysone-backend/src/modules/portal/portal.service.ts
- jurysone-backend/src/modules/portal/portal.controller.ts
- jurysone-backend/src/modules/portal/guards/portal-auth.guard.ts

Banco de dados: já tem os modelos ClientPortalUser e Parceiro no schema.prisma

Faça:
1. Leia esses arquivos e complete a implementação do portal

2. Para CLIENTES, implemente:
   - enviarConviteAcesso(clienteId): gera token único, envia por email/WhatsApp
   - loginCliente(token): autentica com token mágico (sem senha)
   - getProcessos(clientePortalToken): lista processos do cliente (somente leitura)
   - getDocumentos(clientePortalToken): lista e download de documentos
   - getCobrancas(clientePortalToken): ver honorários e pagar online
   - enviarMensagem(clientePortalToken, mensagem): chat simples com o advogado

3. Para PARCEIROS (advogados parceiros), implemente:
   - convidarParceiro(email, nome, oab): envia convite por email
   - loginParceiro(email, senha): autenticação completa com JWT
   - getCasosCompartilhados(): lista processos onde é responsável secundário

4. Crie as rotas no frontend:
   - /portal/[token] → Dashboard do cliente
   - /parceiro/login → Login do advogado parceiro
   - /parceiro/dashboard → Dashboard do parceiro

5. Garanta que RLS do Supabase protege os dados (cliente só vê seus próprios dados)
```

---

### TAREFA 18 — Configurar Notificações em Tempo Real (WebSocket + Push)

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso ativar notificações em tempo real.

O sistema já tem Socket.io configurado no backend:
- jurysone-backend/src/modules/notifications/notifications.gateway.ts
- jurysone-backend/src/modules/notifications/notifications.service.ts

Faça:
1. Leia esses arquivos e complete a implementação

2. Configure os canais WebSocket:
   - room:user:{userId} → notificações pessoais
   - room:office:{officeId} → notificações do escritório

3. Eventos a emitir:
   - novo_prazo_fatal: quando prazo < 24h
   - nova_intimacao: DataJud detectou nova movimentação
   - pagamento_confirmado: webhook Asaas confirmou pagamento
   - assinatura_concluida: ZapSign: documento foi assinado
   - nova_mensagem_portal: cliente enviou mensagem pelo portal

4. No Frontend, configure o socket.io-client:
   - Em jurysone-frontend/lib/socket.ts: criar cliente WebSocket com reconexão automática
   - Em jurysone-frontend/components/layout/Header.tsx: exibir badge de notificações
   - Ao clicar na notificação: navegar para a tela relevante

5. Configure também Push Notifications para mobile/desktop:
   - Usar a API nativa de Push do navegador (não precisa de serviço externo)
   - Salvar PushSubscription no banco (tabela já existe)
   - Usar web-push para enviar (já está no package.json)
   - Adicione no .env: VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY
   - Gerar chaves: npx web-push generate-vapid-keys
```

---

## FASE 7 — Funcionalidades Finais

### TAREFA 19 — Criar seed inicial e usuário admin para o primeiro escritório

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso criar o seed do banco de dados com:
1. Um escritório inicial (Office) — Domingos Advocacia
2. Um usuário administrador
3. Dados de demonstração para testar o sistema

O arquivo de seed está em: jurysone-backend/src/database/seeds/seed.ts

Faça:
1. Crie/complete o arquivo seed.ts com:
   - Escritório: { name: "Domingos Advocacia", domain: "jurysone.com.br" }
   - Admin: { name: "Jonathan Domingos", email: "domingos.advss@gmail.com", role: "ADMIN", senha: gerada automaticamente }
   - 3 clientes de exemplo
   - 5 processos de exemplo em diferentes fases
   - Subscription TRIAL por 30 dias
   - Settings padrão

2. Adicione script no package.json:
   "db:seed": "ts-node -r tsconfig-paths/register src/database/seeds/seed.ts"

3. Execute o seed no banco Supabase:
   DATABASE_URL="[URL_SUPABASE_DIRECT]" npm run db:seed

4. Gere e mostre as credenciais do admin criado

5. Verifique no Supabase Dashboard que as tabelas foram populadas corretamente

Importante: o hash da senha deve usar argon2 (já é a biblioteca usada no projeto).
```

---

### TAREFA 20 — Teste final e checklist de produção

**Cole este prompt em uma nova conversa do Claude:**

```
Sou desenvolvedor do JurysOne. Preciso fazer o teste final antes de lançar.

O sistema está:
- Frontend em: https://jurysone.com.br
- Backend em: https://api.jurysone.com.br
- Banco: Supabase
- Domínio: jurysone.com.br (já configurado)

Execute o checklist completo de produção:

SEGURANÇA:
[ ] JWT_SECRET tem 64+ caracteres aleatórios
[ ] Variáveis de ambiente não estão expostas no frontend
[ ] CORS configurado apenas para jurysone.com.br
[ ] Rate limiting ativo no backend (throttler)
[ ] RLS ativo no Supabase
[ ] Helmet.js ativo no NestJS

FUNCIONALIDADE:
[ ] Login e cadastro funcionando
[ ] Criar/listar/editar processo
[ ] Upload de documento
[ ] Gerar cobrança (PIX de teste no Asaas sandbox)
[ ] Enviar email (teste Resend)
[ ] Buscar processo no DataJud
[ ] Portal do cliente funcionando
[ ] WebSocket conectando

PERFORMANCE:
[ ] Build do frontend sem erros
[ ] Lighthouse score > 80
[ ] Tempo de resposta da API < 500ms

Para cada item com falha, me mostre o erro e a solução.
Gere um relatório final do sistema pronto para produção.
```

---

## 💰 CUSTO MENSAL ESTIMADO (Após configurar tudo)

| Serviço | Plano | Custo Mensal |
|---------|-------|-------------|
| Supabase (banco + storage) | Free tier | **Grátis** |
| Vercel (frontend) | Hobby | **Grátis** |
| Railway (backend) | Hobby | **~$5/mês** (~R$28) |
| Registro.br (domínio) | Anual | **~R$3,33/mês** |
| OpenAI (IA jurídica) | Pay-per-use | **~R$50-100/mês** |
| Asaas (pagamentos) | Por transação | **~R$0 fixo** |
| ZapSign (assinatura) | Básico | **~R$49/mês** |
| Resend (email) | Free | **Grátis** (3k/mês) |
| Evolution API (WhatsApp) | Self-hosted | **Grátis** |
| **TOTAL** | | **~R$130-200/mês** |

---

## 🎯 ORDEM RECOMENDADA DE EXECUÇÃO

1. ✅ **Tarefa 1** — Dockerfiles (sem isso, nada funciona)
2. ✅ **Tarefa 2** — Configs do Frontend (next.config, tailwind)
3. ✅ **Tarefa 3** — Dependências do Frontend
4. ✅ **Tarefa 4** — Módulos NestJS faltantes
5. ✅ **Tarefa 5** — Supabase (banco de dados em produção)
6. ✅ **Tarefa 19** — Seed inicial (criar o primeiro usuário admin)
7. ✅ **Tarefa 7** — DataJud CNJ (gratuito, fundamental)
8. ✅ **Tarefa 11** — Storage Supabase (para documentos)
9. ✅ **Tarefa 12** — Resend Email (gratuito)
10. ✅ **Tarefa 14** — Deploy Backend no Railway
11. ✅ **Tarefa 15** — Deploy Frontend na Vercel
12. ✅ **Tarefa 16** — Domínio jurysone.com.br
13. ✅ **Tarefa 17** — Portal do Cliente
14. ✅ **Tarefa 18** — Notificações em tempo real
15. ✅ **Tarefa 8** — OpenAI (IA)
16. ✅ **Tarefa 9** — Asaas (Pagamentos)
17. ✅ **Tarefa 10** — ZapSign (Assinatura)
18. ✅ **Tarefa 13** — WhatsApp Evolution API
19. ✅ **Tarefa 6** — RLS Supabase (segurança)
20. ✅ **Tarefa 20** — Teste final de produção

---

*JurysOne — Sistema de Gestão Jurídica Inteligente*
*Gerado em 29/03/2026 — Análise técnica completa*

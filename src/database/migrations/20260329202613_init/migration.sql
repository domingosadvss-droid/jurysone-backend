-- CreateEnum
CREATE TYPE "StatusAssinatura" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PAUSED');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'PAGO', 'FALHOU', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('CARTAO_CREDITO', 'BOLETO', 'PIX');

-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "StatusProcesso" AS ENUM ('ATIVO', 'ARQUIVADO', 'ENCERRADO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('PRAZO', 'AUDIENCIA', 'REUNIAO', 'TAREFA', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusEvento" AS ENUM ('PENDENTE', 'CONFIRMADO', 'CANCELADO', 'CONCLUIDO');

-- CreateEnum
CREATE TYPE "FonteIntimacao" AS ENUM ('DJE', 'DOU', 'DODF', 'DOESP', 'DOUDF', 'PJE', 'ESAJ', 'OUTROS');

-- CreateEnum
CREATE TYPE "StatusIntimacao" AS ENUM ('NAO_LIDA', 'LIDA', 'RESPONDIDA', 'ARQUIVADA', 'PRAZO_CRIADO');

-- CreateEnum
CREATE TYPE "TipoMonitoramento" AS ENUM ('OAB', 'NOME', 'CPF_CNPJ', 'NUMERO_PROCESSO', 'PALAVRA_CHAVE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "oabNumero" TEXT,
    "oabEstado" TEXT,
    "telefone" TEXT,
    "avatarUrl" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "twoFactorSecret" TEXT,
    "roles" TEXT NOT NULL DEFAULT 'ADVOGADO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "refreshTokenHash" TEXT,
    "escritorioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offices" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "logoUrl" TEXT,
    "dominio" TEXT,
    "corPrimaria" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "status" "StatusAssinatura" NOT NULL DEFAULT 'TRIAL',
    "nomePlano" TEXT NOT NULL DEFAULT 'PRO',
    "trialVenceEm" TIMESTAMP(3),
    "periodoAtualInicio" TIMESTAMP(3),
    "periodoAtualFim" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "assinaturaId" TEXT,
    "valorCentavos" INTEGER NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "status" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE',
    "metodo" "MetodoPagamento" NOT NULL DEFAULT 'CARTAO_CREDITO',
    "gatewayId" TEXT,
    "urlFatura" TEXT,
    "pagoEm" TIMESTAMP(3),
    "vencimento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCliente" NOT NULL DEFAULT 'PF',
    "cpfCnpj" TEXT,
    "cpf" TEXT,
    "rg" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "email" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "cep" TEXT,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processes" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tribunal" TEXT,
    "area" TEXT,
    "tipoAcao" TEXT,
    "status" "StatusProcesso" NOT NULL DEFAULT 'ATIVO',
    "tipo" TEXT,
    "titulo" TEXT,
    "descricao" TEXT,
    "valor" DECIMAL(65,30),
    "fase" TEXT,
    "dataInicio" TIMESTAMP(3),
    "dataPrazo" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "clienteId" TEXT NOT NULL,
    "responsavelId" TEXT,
    "camposCustom" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movements" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "fonte" TEXT NOT NULL DEFAULT 'manual',
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusTarefa" NOT NULL DEFAULT 'PENDENTE',
    "prioridade" "Prioridade" NOT NULL DEFAULT 'MEDIA',
    "dataPrazo" TIMESTAMP(3),
    "dataConclusa" TIMESTAMP(3),
    "processoId" TEXT,
    "responsavelId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prazos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'judicial',
    "dataPrazo" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "processoId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prazos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "caminho" TEXT,
    "url" TEXT,
    "tamanho" INTEGER,
    "mimeType" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "urlAssinatura" TEXT,
    "dataAssinatura" TIMESTAMP(3),
    "categoria" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT,
    "clienteId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "tipo" "TipoEvento" NOT NULL DEFAULT 'PRAZO',
    "diaInteiro" BOOLEAN NOT NULL DEFAULT false,
    "local" TEXT,
    "cor" TEXT,
    "notificarEm" TIMESTAMP(3),
    "notificarAntesMin" INTEGER DEFAULT 30,
    "notificarEmail" BOOLEAN NOT NULL DEFAULT true,
    "notificarWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "recorrencia" TEXT,
    "recorrenciaFim" TIMESTAMP(3),
    "googleEventId" TEXT,
    "googleCalendarId" TEXT,
    "notificacaoEnviada" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusEvento" NOT NULL DEFAULT 'PENDENTE',
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_responsibles" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "event_responsibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "processoId" TEXT,
    "sessaoId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'chat',
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'global',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "tipoEntidade" TEXT,
    "idEntidade" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atendimentos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "processoId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'novo',
    "area" TEXT,
    "tipoAcao" TEXT,
    "valorAcao" DECIMAL(65,30),
    "tipoHonorario" TEXT,
    "valorHonorario" DECIMAL(65,30),
    "percentualExito" DECIMAL(65,30),
    "formaPagamento" TEXT,
    "parcelamento" BOOLEAN NOT NULL DEFAULT false,
    "numParcelas" INTEGER,
    "vencimento1Parc" TIMESTAMP(3),
    "envelopeId" TEXT,
    "menorId" TEXT,
    "questionario" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atendimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menores_representados" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "atendimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3),
    "cpf" TEXT,
    "rg" TEXT,
    "tipoResponsavel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menores_representados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos_financeiros" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "atendimentoId" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "formaPagamento" TEXT,
    "numParcelas" INTEGER,
    "vencimento" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalPaymentId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lancamentos_financeiros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_historico" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "statusAnterior" TEXT,
    "statusNovo" TEXT NOT NULL,
    "origem" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastas_clientes" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "atendimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pastas_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_records" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "atendimentoId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "etapa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT,
    "tokenConvite" TEXT,
    "tokenExpiraEm" TIMESTAMP(3),
    "ativadoEm" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "ultimoLoginEm" TIMESTAMP(3),
    "clienteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_messages" (
    "id" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "anexoUrl" TEXT,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "remetente" TEXT NOT NULL,
    "portalUserId" TEXT,
    "processoId" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_approvals" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "comentario" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "portalUserId" TEXT NOT NULL,
    "processoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nps_responses" (
    "id" TEXT NOT NULL,
    "pontuacao" INTEGER NOT NULL,
    "comentario" TEXT,
    "portalUserId" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nps_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "esign_envelopes" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'simples',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "documentoUrl" TEXT,
    "documentoHash" TEXT,
    "expiraEm" TIMESTAMP(3),
    "dataLimite" TIMESTAMP(3),
    "mensagem" TEXT,
    "canceladoMotivo" TEXT,
    "externalId" TEXT,
    "assinadoEm" TIMESTAMP(3),
    "enviadoEm" TIMESTAMP(3),
    "signatario" JSONB,
    "escritorioId" TEXT NOT NULL,
    "documentoId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "esign_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "esign_signatarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT,
    "papel" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "notificacao" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "assinadoEm" TIMESTAMP(3),
    "assinaturaDesenho" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "geolat" DOUBLE PRECISION,
    "geolng" DOUBLE PRECISION,
    "motivoRecusa" TEXT,
    "envelopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "esign_signatarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "esign_audit_logs" (
    "id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "envelopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "esign_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "esign_templates" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT NOT NULL,
    "configuracao" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "esign_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "duracaoMinutos" INTEGER,
    "faturavel" BOOLEAN NOT NULL DEFAULT true,
    "categoria" TEXT,
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "usuarioId" TEXT NOT NULL,
    "processoId" TEXT,
    "tarefaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timer_sessions" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "faturavel" BOOLEAN NOT NULL DEFAULT true,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausadoEm" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'rodando',
    "usuarioId" TEXT NOT NULL,
    "processoId" TEXT,
    "tarefaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_goals" (
    "id" TEXT NOT NULL,
    "horasMensais" INTEGER NOT NULL,
    "horasFaturaveisMes" INTEGER NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "dados" JSONB,
    "link" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'normal',
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "lidaEm" TIMESTAMP(3),
    "atendimentoId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "conteudo" TEXT,
    "templateId" TEXT,
    "variaveis" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "erroMensagem" TEXT,
    "whatsappMsgId" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "lidaEm" TIMESTAMP(3),
    "escritorioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "processoId" TEXT,
    "enviadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'pt_BR',
    "corpo" TEXT NOT NULL,
    "variaveis" JSONB,
    "botoes" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "waTemplateId" TEXT,
    "escritorioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_automations" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "gatilho" TEXT NOT NULL,
    "templateId" TEXT,
    "atrasoMinutos" INTEGER NOT NULL DEFAULT 0,
    "filtros" JSONB,
    "execucoes" INTEGER NOT NULL DEFAULT 0,
    "ultimaExecucao" TIMESTAMP(3),
    "escritorioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datajud_monitoramentos" (
    "id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "alertarMovimentacao" BOOLEAN NOT NULL DEFAULT true,
    "alertarPrazo" BOOLEAN NOT NULL DEFAULT true,
    "usuariosAlertar" JSONB,
    "ultimaSync" TIMESTAMP(3),
    "totalAndamentos" INTEGER NOT NULL DEFAULT 0,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datajud_monitoramentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automacoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "gatilho" JSONB NOT NULL,
    "condicoes" JSONB,
    "acoes" JSONB NOT NULL,
    "execucoes" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "ultimaExec" TIMESTAMP(3),
    "escritorioId" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automacao_logs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "erroMsg" TEXT,
    "duracaoMs" INTEGER,
    "automacaoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automacao_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_dashboards" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "widgets" JSONB NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intimacoes" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "fonte" "FonteIntimacao" NOT NULL DEFAULT 'DJE',
    "tribunal" TEXT NOT NULL,
    "diarioNome" TEXT,
    "edicao" TEXT,
    "dataPublicacao" TIMESTAMP(3) NOT NULL,
    "dataCaptura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "conteudoResumo" TEXT,
    "urlOrigem" TEXT,
    "paginaDiario" TEXT,
    "caderno" TEXT,
    "nomesEncontrados" JSONB,
    "numeroProcesso" TEXT,
    "status" "StatusIntimacao" NOT NULL DEFAULT 'NAO_LIDA',
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "lidaEm" TIMESTAMP(3),
    "lidaPorId" TEXT,
    "prazoIdentificado" INTEGER,
    "prazoFatal" TIMESTAMP(3),
    "processoId" TEXT,
    "clienteId" TEXT,
    "monitoramentoId" TEXT,
    "providencia" TEXT,
    "providenciaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intimacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diario_monitoramentos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "tipo" "TipoMonitoramento" NOT NULL DEFAULT 'OAB',
    "termoBusca" TEXT NOT NULL,
    "oabNumero" TEXT,
    "oabEstado" TEXT,
    "nomeAdvogado" TEXT,
    "cpfCnpj" TEXT,
    "tribunais" JSONB NOT NULL,
    "cadernos" JSONB,
    "notificarEmail" BOOLEAN NOT NULL DEFAULT true,
    "notificarWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "emailsAlerta" JSONB,
    "responsavelId" TEXT,
    "ultimaExecucao" TIMESTAMP(3),
    "totalCapturado" INTEGER NOT NULL DEFAULT 0,
    "totalNaoLido" INTEGER NOT NULL DEFAULT 0,
    "erroUltimaSync" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diario_monitoramentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diario_execucao_logs" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "tribunal" TEXT NOT NULL,
    "dataEdicao" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "totalEncontrado" INTEGER NOT NULL DEFAULT 0,
    "duracaoMs" INTEGER,
    "erroMsg" TEXT,
    "monitoramentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diario_execucao_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parceiros" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "oabNumero" TEXT,
    "oabEstado" TEXT,
    "areaAtuacao" TEXT,
    "percentualHonorarios" DECIMAL(5,2),
    "email" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "cep" TEXT,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "pixChave" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parceiros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_escritorioId_idx" ON "users"("escritorioId");

-- CreateIndex
CREATE UNIQUE INDEX "offices_cnpj_key" ON "offices"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "offices_dominio_key" ON "offices"("dominio");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_escritorioId_key" ON "subscriptions"("escritorioId");

-- CreateIndex
CREATE INDEX "payments_escritorioId_idx" ON "payments"("escritorioId");

-- CreateIndex
CREATE INDEX "clients_escritorioId_idx" ON "clients"("escritorioId");

-- CreateIndex
CREATE INDEX "clients_cpfCnpj_idx" ON "clients"("cpfCnpj");

-- CreateIndex
CREATE INDEX "processes_escritorioId_idx" ON "processes"("escritorioId");

-- CreateIndex
CREATE INDEX "processes_numero_idx" ON "processes"("numero");

-- CreateIndex
CREATE INDEX "processes_clienteId_idx" ON "processes"("clienteId");

-- CreateIndex
CREATE INDEX "movements_processoId_idx" ON "movements"("processoId");

-- CreateIndex
CREATE INDEX "tasks_escritorioId_idx" ON "tasks"("escritorioId");

-- CreateIndex
CREATE INDEX "tasks_processoId_idx" ON "tasks"("processoId");

-- CreateIndex
CREATE INDEX "prazos_escritorioId_idx" ON "prazos"("escritorioId");

-- CreateIndex
CREATE INDEX "prazos_processoId_idx" ON "prazos"("processoId");

-- CreateIndex
CREATE INDEX "documents_escritorioId_idx" ON "documents"("escritorioId");

-- CreateIndex
CREATE INDEX "documents_processoId_idx" ON "documents"("processoId");

-- CreateIndex
CREATE INDEX "calendar_events_escritorioId_idx" ON "calendar_events"("escritorioId");

-- CreateIndex
CREATE INDEX "calendar_events_data_idx" ON "calendar_events"("data");

-- CreateIndex
CREATE INDEX "calendar_events_clienteId_idx" ON "calendar_events"("clienteId");

-- CreateIndex
CREATE INDEX "calendar_events_processoId_idx" ON "calendar_events"("processoId");

-- CreateIndex
CREATE UNIQUE INDEX "event_responsibles_eventoId_usuarioId_key" ON "event_responsibles"("eventoId", "usuarioId");

-- CreateIndex
CREATE INDEX "ai_interactions_escritorioId_idx" ON "ai_interactions"("escritorioId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "settings_escritorioId_chave_key" ON "settings"("escritorioId", "chave");

-- CreateIndex
CREATE INDEX "audit_logs_escritorioId_idx" ON "audit_logs"("escritorioId");

-- CreateIndex
CREATE INDEX "audit_logs_usuarioId_idx" ON "audit_logs"("usuarioId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "atendimentos_escritorioId_idx" ON "atendimentos"("escritorioId");

-- CreateIndex
CREATE INDEX "atendimentos_clienteId_idx" ON "atendimentos"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "menores_representados_atendimentoId_key" ON "menores_representados"("atendimentoId");

-- CreateIndex
CREATE INDEX "lancamentos_financeiros_escritorioId_idx" ON "lancamentos_financeiros"("escritorioId");

-- CreateIndex
CREATE INDEX "lancamentos_financeiros_clienteId_idx" ON "lancamentos_financeiros"("clienteId");

-- CreateIndex
CREATE INDEX "status_historico_entidadeId_idx" ON "status_historico"("entidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "pastas_clientes_atendimentoId_key" ON "pastas_clientes"("atendimentoId");

-- CreateIndex
CREATE INDEX "crm_records_escritorioId_idx" ON "crm_records"("escritorioId");

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_users_email_key" ON "client_portal_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_users_tokenConvite_key" ON "client_portal_users"("tokenConvite");

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_users_clienteId_key" ON "client_portal_users"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "esign_signatarios_token_key" ON "esign_signatarios"("token");

-- CreateIndex
CREATE INDEX "esign_templates_escritorioId_idx" ON "esign_templates"("escritorioId");

-- CreateIndex
CREATE UNIQUE INDEX "time_goals_usuarioId_escritorioId_key" ON "time_goals"("usuarioId", "escritorioId");

-- CreateIndex
CREATE INDEX "notifications_usuarioId_lida_idx" ON "notifications"("usuarioId", "lida");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_usuarioId_canal_tipo_key" ON "notification_preferences"("usuarioId", "canal", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "datajud_monitoramentos_escritorioId_processoId_key" ON "datajud_monitoramentos"("escritorioId", "processoId");

-- CreateIndex
CREATE INDEX "intimacoes_escritorioId_idx" ON "intimacoes"("escritorioId");

-- CreateIndex
CREATE INDEX "intimacoes_dataPublicacao_idx" ON "intimacoes"("dataPublicacao");

-- CreateIndex
CREATE INDEX "intimacoes_status_idx" ON "intimacoes"("status");

-- CreateIndex
CREATE INDEX "intimacoes_tribunal_idx" ON "intimacoes"("tribunal");

-- CreateIndex
CREATE INDEX "intimacoes_processoId_idx" ON "intimacoes"("processoId");

-- CreateIndex
CREATE INDEX "diario_monitoramentos_escritorioId_idx" ON "diario_monitoramentos"("escritorioId");

-- CreateIndex
CREATE INDEX "diario_execucao_logs_escritorioId_idx" ON "diario_execucao_logs"("escritorioId");

-- CreateIndex
CREATE INDEX "diario_execucao_logs_tribunal_idx" ON "diario_execucao_logs"("tribunal");

-- CreateIndex
CREATE INDEX "parceiros_escritorioId_idx" ON "parceiros"("escritorioId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processes" ADD CONSTRAINT "processes_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processes" ADD CONSTRAINT "processes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processes" ADD CONSTRAINT "processes_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_responsibles" ADD CONSTRAINT "event_responsibles_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_responsibles" ADD CONSTRAINT "event_responsibles_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menores_representados" ADD CONSTRAINT "menores_representados_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "atendimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "atendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_historico" ADD CONSTRAINT "status_historico_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastas_clientes" ADD CONSTRAINT "pastas_clientes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastas_clientes" ADD CONSTRAINT "pastas_clientes_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "atendimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "atendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_users" ADD CONSTRAINT "client_portal_users_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "client_portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_approvals" ADD CONSTRAINT "portal_approvals_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "client_portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_approvals" ADD CONSTRAINT "portal_approvals_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_responses" ADD CONSTRAINT "nps_responses_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "client_portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_responses" ADD CONSTRAINT "nps_responses_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esign_envelopes" ADD CONSTRAINT "esign_envelopes_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esign_envelopes" ADD CONSTRAINT "esign_envelopes_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esign_signatarios" ADD CONSTRAINT "esign_signatarios_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "esign_envelopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esign_audit_logs" ADD CONSTRAINT "esign_audit_logs_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "esign_envelopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timer_sessions" ADD CONSTRAINT "timer_sessions_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_goals" ADD CONSTRAINT "time_goals_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_goals" ADD CONSTRAINT "time_goals_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_automations" ADD CONSTRAINT "whatsapp_automations_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datajud_monitoramentos" ADD CONSTRAINT "datajud_monitoramentos_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datajud_monitoramentos" ADD CONSTRAINT "datajud_monitoramentos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automacoes" ADD CONSTRAINT "automacoes_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automacoes" ADD CONSTRAINT "automacoes_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automacao_logs" ADD CONSTRAINT "automacao_logs_automacaoId_fkey" FOREIGN KEY ("automacaoId") REFERENCES "automacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_dashboards" ADD CONSTRAINT "analytics_dashboards_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intimacoes" ADD CONSTRAINT "intimacoes_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intimacoes" ADD CONSTRAINT "intimacoes_lidaPorId_fkey" FOREIGN KEY ("lidaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intimacoes" ADD CONSTRAINT "intimacoes_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intimacoes" ADD CONSTRAINT "intimacoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intimacoes" ADD CONSTRAINT "intimacoes_monitoramentoId_fkey" FOREIGN KEY ("monitoramentoId") REFERENCES "diario_monitoramentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diario_monitoramentos" ADD CONSTRAINT "diario_monitoramentos_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diario_monitoramentos" ADD CONSTRAINT "diario_monitoramentos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diario_monitoramentos" ADD CONSTRAINT "diario_monitoramentos_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parceiros" ADD CONSTRAINT "parceiros_escritorioId_fkey" FOREIGN KEY ("escritorioId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

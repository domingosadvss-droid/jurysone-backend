-- AlterEnum
ALTER TYPE "FonteIntimacao" ADD VALUE 'DJEN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "googleAgendaConectadoEm" TIMESTAMP(3),
ADD COLUMN     "googleAgendaId" TEXT,
ADD COLUMN     "googleAgendaToken" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "cadastroIncompleto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "prazos" ADD COLUMN     "alerta3dEm" TIMESTAMP(3),
ADD COLUMN     "alertaDiaEm" TIMESTAMP(3),
ADD COLUMN     "conferir" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contagem" TEXT,
ADD COLUMN     "cumpridoEm" TIMESTAMP(3),
ADD COLUMN     "cumpridoPorId" TEXT,
ADD COLUMN     "dataInicio" TIMESTAMP(3),
ADD COLUMN     "diasPrazo" INTEGER,
ADD COLUMN     "eventoId" TEXT,
ADD COLUMN     "intimacaoId" TEXT,
ADD COLUMN     "memoriaCalculo" JSONB,
ADD COLUMN     "origem" TEXT,
ADD COLUMN     "responsaveisIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "event_responsibles" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable
ALTER TABLE "intimacoes" ADD COLUMN     "advogados" JSONB,
ADD COLUMN     "cancelada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "categorias" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "classe" TEXT,
ADD COLUMN     "coincidencias" JSONB,
ADD COLUMN     "destinatarios" JSONB,
ADD COLUMN     "djenHash" TEXT,
ADD COLUMN     "djenId" TEXT,
ADD COLUMN     "intimadosIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "motivoCancelamento" TEXT,
ADD COLUMN     "orgao" TEXT,
ADD COLUMN     "particular" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "semVinculo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sugestoesVinculo" JSONB,
ADD COLUMN     "tipoComunicacao" TEXT,
ADD COLUMN     "tipoDocumento" TEXT;

-- AlterTable
ALTER TABLE "impedimentos" ADD COLUMN     "processoNumero" TEXT;

-- CreateTable
CREATE TABLE "feriados_calendario" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "dataFim" DATE,
    "tribunal" TEXT,
    "comarca" TEXT,
    "descricao" TEXT NOT NULL,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feriados_calendario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estado_captura_djen" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "oab" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "coberturaAte" DATE,
    "ultimaTentativaEm" TIMESTAMP(3),
    "ultimoSucessoEm" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "falhaDesde" TIMESTAMP(3),
    "alertaEnviadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estado_captura_djen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casos_dativa" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "advogadoId" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "origemRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOMEADO',
    "nomeadoEm" TIMESTAMP(3) NOT NULL,
    "comarca" TEXT,
    "materia" TEXT,
    "referenciaAjg" TEXT,
    "aceiteAte" TIMESTAMP(3),
    "aceitoEm" TIMESTAMP(3),
    "recusadoEm" TIMESTAMP(3),
    "motivoRecusa" TEXT,
    "conflitos" JSONB,
    "reuPreso" BOOLEAN NOT NULL DEFAULT false,
    "presoDesde" TIMESTAMP(3),
    "ultimaRevisaoPreventiva" TIMESTAMP(3),
    "proximoAlertaPreventiva" TIMESTAMP(3),
    "sentencaEm" TIMESTAMP(3),
    "honorariosFixadosEm" TIMESTAMP(3),
    "valorFixado" DECIMAL(12,2),
    "certidaoEm" TIMESTAMP(3),
    "pedidoPagamentoEm" TIMESTAMP(3),
    "pagoEm" TIMESTAMP(3),
    "valorPago" DECIMAL(12,2),
    "lancamentoId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "casos_dativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_cliente" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "clienteId" TEXT,
    "processoId" TEXT,
    "origemId" TEXT,
    "telefone" TEXT,
    "texto" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "precisaAprovacao" BOOLEAN NOT NULL DEFAULT false,
    "responsavelId" TEXT,
    "aprovadaPorId" TEXT,
    "aprovadaEm" TIMESTAMP(3),
    "enviarEm" TIMESTAMP(3),
    "enviadaEm" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mensagens_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pendencias_importacao" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "numeroProcesso" TEXT NOT NULL,
    "tribunal" TEXT,
    "orgao" TEXT,
    "classe" TEXT,
    "ultimaPublicacao" TIMESTAMP(3),
    "partes" JSONB,
    "clienteSugeridoId" TEXT,
    "motivo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "processoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pendencias_importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "varreduras_documento" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "documentoId" TEXT,
    "processoId" TEXT,
    "nomeArquivo" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "achados" JSONB,
    "resumo" TEXT,
    "decisao" TEXT,
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "varreduras_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rascunhos_peca" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "varreduraId" TEXT,
    "tipoPeca" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "texto" TEXT,
    "modelo" TEXT,
    "erro" TEXT,
    "prazoId" TEXT,
    "criadoPorId" TEXT,
    "geradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rascunhos_peca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feriados_calendario_escritorioId_data_idx" ON "feriados_calendario"("escritorioId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "estado_captura_djen_escritorioId_usuarioId_key" ON "estado_captura_djen"("escritorioId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "casos_dativa_processoId_key" ON "casos_dativa"("processoId");

-- CreateIndex
CREATE INDEX "casos_dativa_escritorioId_status_idx" ON "casos_dativa"("escritorioId", "status");

-- CreateIndex
CREATE INDEX "casos_dativa_advogadoId_idx" ON "casos_dativa"("advogadoId");

-- CreateIndex
CREATE INDEX "mensagens_cliente_escritorioId_status_enviarEm_idx" ON "mensagens_cliente"("escritorioId", "status", "enviarEm");

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_cliente_escritorioId_chave_key" ON "mensagens_cliente"("escritorioId", "chave");

-- CreateIndex
CREATE INDEX "pendencias_importacao_escritorioId_status_idx" ON "pendencias_importacao"("escritorioId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pendencias_importacao_escritorioId_usuarioId_numeroProcesso_key" ON "pendencias_importacao"("escritorioId", "usuarioId", "numeroProcesso");

-- CreateIndex
CREATE INDEX "varreduras_documento_escritorioId_idx" ON "varreduras_documento"("escritorioId");

-- CreateIndex
CREATE INDEX "varreduras_documento_documentoId_idx" ON "varreduras_documento"("documentoId");

-- CreateIndex
CREATE INDEX "rascunhos_peca_escritorioId_processoId_idx" ON "rascunhos_peca"("escritorioId", "processoId");

-- CreateIndex
CREATE INDEX "prazos_escritorioId_status_dataPrazo_idx" ON "prazos"("escritorioId", "status", "dataPrazo");

-- CreateIndex
CREATE UNIQUE INDEX "intimacoes_escritorioId_djenId_key" ON "intimacoes"("escritorioId", "djenId");


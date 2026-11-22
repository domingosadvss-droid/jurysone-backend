-- Etapa B: catálogo de serviços, histórico de versões e sugestões (aditiva)
CREATE TABLE "catalogo_servicos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "descricao" TEXT,
    "modeloLinhaCodigo" TEXT,
    "responsavelId" TEXT,
    "precoSugerido" DECIMAL(12,2),
    "tipoHonorario" TEXT,
    "percentualExito" DECIMAL(5,2),
    "documentos" JSONB NOT NULL DEFAULT '[]',
    "perguntas" JSONB NOT NULL DEFAULT '[]',
    "orientacoes" TEXT,
    "faq" JSONB NOT NULL DEFAULT '[]',
    "palavrasChave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "aprovadoPorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catalogo_servicos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalogo_servicos_escritorioId_codigo_key" ON "catalogo_servicos"("escritorioId", "codigo");
CREATE INDEX "catalogo_servicos_escritorioId_status_idx" ON "catalogo_servicos"("escritorioId", "status");

CREATE TABLE "catalogo_servicos_versoes" (
    "id" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,
    "alteradoPorId" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "catalogo_servicos_versoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "catalogo_servicos_versoes_servicoId_versao_idx" ON "catalogo_servicos_versoes"("servicoId", "versao");
ALTER TABLE "catalogo_servicos_versoes" ADD CONSTRAINT "catalogo_servicos_versoes_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "catalogo_servicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "catalogo_sugestoes" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "servicoId" TEXT,
    "dados" JSONB NOT NULL,
    "justificativa" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'IA',
    "conversaId" TEXT,
    "atendimentoId" TEXT,
    "criadoPorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoDecisao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "catalogo_sugestoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "catalogo_sugestoes_escritorioId_status_idx" ON "catalogo_sugestoes"("escritorioId", "status");

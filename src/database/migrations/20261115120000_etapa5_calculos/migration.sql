-- Etapa 5 (calculadoras): somente tabelas novas, nada é alterado ou apagado.

-- CreateTable
CREATE TABLE "indices_economicos" (
    "id" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valor" DECIMAL(14,6) NOT NULL,
    "obtidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "indices_economicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT,
    "clienteId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "responsavelId" TEXT,
    "versaoAtual" INTEGER NOT NULL DEFAULT 1,
    "atualizarAuto" BOOLEAN NOT NULL DEFAULT true,
    "ultimaAtualizacaoEm" TIMESTAMP(3),
    "arquivado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "calculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculos_versoes" (
    "id" TEXT NOT NULL,
    "calculoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "origem" TEXT NOT NULL,
    "parametros" JSONB NOT NULL,
    "resultado" JSONB NOT NULL,
    "totalPrincipal" DECIMAL(16,2),
    "dataBase" DATE NOT NULL,
    "indicesAte" TEXT,
    "mensagemChat" TEXT,
    "explicacaoIa" TEXT,
    "juntada" BOOLEAN NOT NULL DEFAULT false,
    "juntadaEm" TIMESTAMP(3),
    "juntadaPorId" TEXT,
    "documentosIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calculos_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracoes_pagamentos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "varreduraId" TEXT,
    "status" TEXT NOT NULL,
    "arquivo" BYTEA,
    "pagamentos" JSONB,
    "observacoes" TEXT,
    "modelo" TEXT,
    "erro" TEXT,
    "conferidaPorId" TEXT,
    "conferidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "extracoes_pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custas_faixas" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "tribunal" TEXT NOT NULL DEFAULT 'TJSC',
    "ato" TEXT NOT NULL DEFAULT 'INICIAL',
    "valorDe" DECIMAL(16,2) NOT NULL,
    "valorAte" DECIMAL(16,2),
    "valorFixo" DECIMAL(14,2),
    "percentual" DECIMAL(8,4),
    "minimo" DECIMAL(14,2),
    "maximo" DECIMAL(14,2),
    "vigenciaDe" DATE NOT NULL,
    "fonte" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "custas_faixas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indices_economicos_serie_competencia_key" ON "indices_economicos"("serie", "competencia");
CREATE INDEX "calculos_escritorioId_tipo_idx" ON "calculos"("escritorioId", "tipo");
CREATE INDEX "calculos_processoId_idx" ON "calculos"("processoId");
CREATE UNIQUE INDEX "calculos_versoes_calculoId_numero_key" ON "calculos_versoes"("calculoId", "numero");
CREATE INDEX "extracoes_pagamentos_escritorioId_status_idx" ON "extracoes_pagamentos"("escritorioId", "status");
CREATE INDEX "custas_faixas_escritorioId_tribunal_ato_idx" ON "custas_faixas"("escritorioId", "tribunal", "ato");

-- AddForeignKey
ALTER TABLE "calculos_versoes" ADD CONSTRAINT "calculos_versoes_calculoId_fkey" FOREIGN KEY ("calculoId") REFERENCES "calculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

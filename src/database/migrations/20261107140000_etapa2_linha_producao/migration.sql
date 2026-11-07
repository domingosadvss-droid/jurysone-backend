-- CreateTable
CREATE TABLE "modelos_linha" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelos_linha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas_modelo" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "responsavelTipo" TEXT NOT NULL DEFAULT 'ADVOGADO_RESPONSAVEL',
    "responsavelPadraoId" TEXT,
    "aguardando" TEXT,
    "prazoDias" INTEGER NOT NULL DEFAULT 5,
    "opcional" BOOLEAN NOT NULL DEFAULT false,
    "checklist" JSONB,

    CONSTRAINT "etapas_modelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_processo" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "modeloVersao" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "iniciadaPor" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linhas_processo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas_linha" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "linhaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "aguardando" TEXT,
    "opcional" BOOLEAN NOT NULL DEFAULT false,
    "prazoDias" INTEGER NOT NULL DEFAULT 5,
    "responsavelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "checklist" JSONB,
    "iniciadaEm" TIMESTAMP(3),
    "prazoEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "concluidaPor" TEXT,
    "observacao" TEXT,
    "alertadoEm" TIMESTAMP(3),

    CONSTRAINT "etapas_linha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modelos_linha_escritorioId_idx" ON "modelos_linha"("escritorioId");

-- CreateIndex
CREATE UNIQUE INDEX "modelos_linha_escritorioId_codigo_key" ON "modelos_linha"("escritorioId", "codigo");

-- CreateIndex
CREATE INDEX "etapas_modelo_modeloId_idx" ON "etapas_modelo"("modeloId");

-- CreateIndex
CREATE INDEX "linhas_processo_escritorioId_idx" ON "linhas_processo"("escritorioId");

-- CreateIndex
CREATE INDEX "linhas_processo_processoId_idx" ON "linhas_processo"("processoId");

-- CreateIndex
CREATE INDEX "etapas_linha_escritorioId_status_idx" ON "etapas_linha"("escritorioId", "status");

-- CreateIndex
CREATE INDEX "etapas_linha_linhaId_idx" ON "etapas_linha"("linhaId");

-- CreateIndex
CREATE INDEX "etapas_linha_responsavelId_status_idx" ON "etapas_linha"("responsavelId", "status");

-- AddForeignKey
ALTER TABLE "etapas_modelo" ADD CONSTRAINT "etapas_modelo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "modelos_linha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_processo" ADD CONSTRAINT "linhas_processo_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_processo" ADD CONSTRAINT "linhas_processo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "modelos_linha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_linha" ADD CONSTRAINT "etapas_linha_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "linhas_processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;


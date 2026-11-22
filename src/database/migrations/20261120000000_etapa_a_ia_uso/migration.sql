-- Etapa A: registro de uso e custo da IA (aditiva)
CREATE TABLE "ia_uso" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "tarefa" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSaida" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheLeitura" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheEscrita" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "cotacaoUsd" DECIMAL(10,4),
    "custoBrl" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "erro" TEXT,
    "processoId" TEXT,
    "atendimentoId" TEXT,
    "conversaId" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ia_uso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ia_uso_escritorioId_createdAt_idx" ON "ia_uso"("escritorioId", "createdAt");
CREATE INDEX "ia_uso_processoId_idx" ON "ia_uso"("processoId");

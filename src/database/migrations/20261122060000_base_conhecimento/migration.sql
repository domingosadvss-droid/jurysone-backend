-- Base de conhecimento do escritório, com busca em português do próprio Postgres (sem custo)
CREATE TABLE "conhecimento_documentos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "area" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'TEXTO',
    "nomeArquivo" TEXT,
    "texto" TEXT NOT NULL,
    "usoAtendimento" BOOLEAN NOT NULL DEFAULT false,
    "varredura" TEXT NOT NULL DEFAULT 'TEXTO',
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conhecimento_documentos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conhecimento_documentos_escritorioId_tipo_idx" ON "conhecimento_documentos"("escritorioId", "tipo");

CREATE TABLE "conhecimento_trechos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "busca" tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', "texto")) STORED,
    CONSTRAINT "conhecimento_trechos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conhecimento_trechos_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "conhecimento_documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "conhecimento_trechos_escritorioId_idx" ON "conhecimento_trechos"("escritorioId");
CREATE INDEX "conhecimento_trechos_documentoId_idx" ON "conhecimento_trechos"("documentoId");
CREATE INDEX "conhecimento_trechos_busca_idx" ON "conhecimento_trechos" USING GIN ("busca");

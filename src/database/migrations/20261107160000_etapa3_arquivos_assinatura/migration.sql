-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "driveFolderId" TEXT;

-- AlterTable
ALTER TABLE "processes" ADD COLUMN     "driveFolderId" TEXT,
ADD COLUMN     "drivePastas" JSONB;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "arquivoExternoId" TEXT,
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "enviadoPorId" TEXT,
ADD COLUMN     "etapaId" TEXT,
ADD COLUMN     "hashSha256" TEXT,
ADD COLUMN     "itemChecklistId" TEXT,
ADD COLUMN     "origem" TEXT,
ADD COLUMN     "provedor" TEXT;

-- CreateTable
CREATE TABLE "pacotes_assinatura" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "etapaId" TEXT,
    "provedor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "externoId" TEXT,
    "linkAssinatura" TEXT,
    "signatarios" JSONB,
    "documentos" JSONB NOT NULL,
    "criadoPorId" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "assinadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pacotes_assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pacotes_assinatura_escritorioId_idx" ON "pacotes_assinatura"("escritorioId");

-- CreateIndex
CREATE INDEX "pacotes_assinatura_processoId_idx" ON "pacotes_assinatura"("processoId");

-- CreateIndex
CREATE INDEX "pacotes_assinatura_externoId_idx" ON "pacotes_assinatura"("externoId");


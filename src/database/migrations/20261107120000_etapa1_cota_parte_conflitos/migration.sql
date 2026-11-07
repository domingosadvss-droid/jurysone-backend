-- AlterTable
ALTER TABLE "users" ADD COLUMN     "parceiroId" TEXT,
ADD COLUMN     "termoAceitoEm" TIMESTAMP(3),
ADD COLUMN     "termoDocumentoUrl" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "indicadoPor" TEXT,
ADD COLUMN     "origem" TEXT,
ADD COLUMN     "temFilhos" BOOLEAN;

-- AlterTable
ALTER TABLE "lancamentos_financeiros" ADD COLUMN     "origemRecebimento" TEXT,
ADD COLUMN     "processoId" TEXT,
ADD COLUMN     "taxaGateway" DECIMAL(12,2),
ADD COLUMN     "tipoHonorario" TEXT;

-- CreateTable
CREATE TABLE "participacoes_processo" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "parceiroId" TEXT,
    "papel" TEXT NOT NULL,
    "percentualCustom" DECIMAL(5,2),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participacoes_processo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_cota_parte" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "parceiroId" TEXT,
    "papel" TEXT NOT NULL,
    "tipoHonorario" TEXT NOT NULL DEFAULT 'TODOS',
    "percentual" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regras_cota_parte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fechamentos_repasse" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "ate" TIMESTAMP(3) NOT NULL,
    "aliquotaImposto" DECIMAL(5,2) NOT NULL,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fechamentos_repasse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_repasse" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "fechamentoId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "beneficiarioKey" TEXT NOT NULL,
    "usuarioId" TEXT,
    "parceiroId" TEXT,
    "papel" TEXT NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "valorBruto" DECIMAL(12,2) NOT NULL,
    "taxaGateway" DECIMAL(12,2) NOT NULL,
    "imposto" DECIMAL(12,2) NOT NULL,
    "base" DECIMAL(12,2) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "repassadoEm" TIMESTAMP(3),
    "comprovanteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itens_repasse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impedimentos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT,
    "cpfCnpj" TEXT,
    "orgao" TEXT,
    "descricao" TEXT,
    "dataEvento" TIMESTAMP(3),
    "validoAte" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impedimentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "participacoes_processo_escritorioId_idx" ON "participacoes_processo"("escritorioId");

-- CreateIndex
CREATE INDEX "participacoes_processo_processoId_idx" ON "participacoes_processo"("processoId");

-- CreateIndex
CREATE INDEX "participacoes_processo_usuarioId_idx" ON "participacoes_processo"("usuarioId");

-- CreateIndex
CREATE INDEX "participacoes_processo_parceiroId_idx" ON "participacoes_processo"("parceiroId");

-- CreateIndex
CREATE INDEX "regras_cota_parte_escritorioId_idx" ON "regras_cota_parte"("escritorioId");

-- CreateIndex
CREATE INDEX "fechamentos_repasse_escritorioId_idx" ON "fechamentos_repasse"("escritorioId");

-- CreateIndex
CREATE INDEX "itens_repasse_escritorioId_idx" ON "itens_repasse"("escritorioId");

-- CreateIndex
CREATE INDEX "itens_repasse_fechamentoId_idx" ON "itens_repasse"("fechamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "itens_repasse_lancamentoId_beneficiarioKey_key" ON "itens_repasse"("lancamentoId", "beneficiarioKey");

-- CreateIndex
CREATE INDEX "impedimentos_escritorioId_idx" ON "impedimentos"("escritorioId");

-- CreateIndex
CREATE INDEX "impedimentos_usuarioId_idx" ON "impedimentos"("usuarioId");

-- CreateIndex
CREATE INDEX "lancamentos_financeiros_processoId_idx" ON "lancamentos_financeiros"("processoId");

-- AddForeignKey
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participacoes_processo" ADD CONSTRAINT "participacoes_processo_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_repasse" ADD CONSTRAINT "itens_repasse_fechamentoId_fkey" FOREIGN KEY ("fechamentoId") REFERENCES "fechamentos_repasse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_repasse" ADD CONSTRAINT "itens_repasse_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamentos_financeiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


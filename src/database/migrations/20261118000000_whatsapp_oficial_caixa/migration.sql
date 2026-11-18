-- CreateTable
CREATE TABLE "whatsapp_conexoes" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "numeroExibicao" TEXT,
    "nomeExibicao" TEXT,
    "tokenCifrado" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "coexistencia" BOOLEAN NOT NULL DEFAULT false,
    "historicoImportadoEm" TIMESTAMP(3),
    "pastaRaizId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conexoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversas" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "conexaoId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "nomeContato" TEXT,
    "clienteId" TEXT,
    "ultimaMensagemEm" TIMESTAMP(3),
    "ultimaEntradaEm" TIMESTAMP(3),
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "pastaArquivosId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_mensagens_caixa" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "wamid" TEXT,
    "direcao" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT,
    "midiaId" TEXT,
    "midiaMime" TEXT,
    "midiaNome" TEXT,
    "arquivoId" TEXT,
    "arquivoTamanho" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'recebida',
    "erro" TEXT,
    "enviadaPorId" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_mensagens_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conexoes_phoneNumberId_key" ON "whatsapp_conexoes"("phoneNumberId");

-- CreateIndex
CREATE INDEX "whatsapp_conexoes_escritorioId_idx" ON "whatsapp_conexoes"("escritorioId");

-- CreateIndex
CREATE INDEX "whatsapp_conversas_escritorioId_ultimaMensagemEm_idx" ON "whatsapp_conversas"("escritorioId", "ultimaMensagemEm");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversas_conexaoId_telefone_key" ON "whatsapp_conversas"("conexaoId", "telefone");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_mensagens_caixa_wamid_key" ON "whatsapp_mensagens_caixa"("wamid");

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_caixa_conversaId_dataHora_idx" ON "whatsapp_mensagens_caixa"("conversaId", "dataHora");

-- AddForeignKey
ALTER TABLE "whatsapp_conversas" ADD CONSTRAINT "whatsapp_conversas_conexaoId_fkey" FOREIGN KEY ("conexaoId") REFERENCES "whatsapp_conexoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens_caixa" ADD CONSTRAINT "whatsapp_mensagens_caixa_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "whatsapp_conversas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


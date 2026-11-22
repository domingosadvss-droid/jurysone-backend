-- Aprendizado do atendimento automático e lembretes ao cliente
ALTER TABLE "whatsapp_conversas" ADD COLUMN "lembretesEnviados" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "whatsapp_conversas" ADD COLUMN "ultimoLembreteEm" TIMESTAMP(3);
ALTER TABLE "whatsapp_conversas" ADD COLUMN "aprendizadoEm" TIMESTAMP(3);

CREATE TABLE "atendimento_exemplos" (
    "id" TEXT NOT NULL,
    "escritorioId" TEXT NOT NULL,
    "conversaId" TEXT,
    "mensagemAdvogadoId" TEXT,
    "perguntaCliente" TEXT NOT NULL,
    "respostaAdvogado" TEXT NOT NULL,
    "respostaIa" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "criadoPorId" TEXT,
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "atendimento_exemplos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "atendimento_exemplos_mensagemAdvogadoId_key" ON "atendimento_exemplos"("mensagemAdvogadoId");
CREATE INDEX "atendimento_exemplos_escritorioId_status_idx" ON "atendimento_exemplos"("escritorioId", "status");

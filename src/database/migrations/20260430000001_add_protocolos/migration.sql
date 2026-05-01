-- CreateTable: protocolos (peticionamento eletrônico)
CREATE TABLE "protocolos" (
    "id"               TEXT NOT NULL,
    "escritorioId"     TEXT NOT NULL,
    "processoId"       TEXT,
    "advogadoId"       TEXT NOT NULL,
    "tribunal"         TEXT NOT NULL,
    "tipoPeticao"      TEXT NOT NULL,
    "arquivoUrl"       TEXT,
    "numeroProtocolo"  TEXT,
    "status"           TEXT NOT NULL DEFAULT 'pendente',
    "respostaTribunal" JSONB,
    "dataProtocolo"    TIMESTAMP(3),
    "erroMensagem"     TEXT,
    "deletedAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocolos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "protocolos_escritorioId_idx" ON "protocolos"("escritorioId");
CREATE INDEX "protocolos_processoId_idx"  ON "protocolos"("processoId");

-- AddForeignKey
ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_escritorioId_fkey"
    FOREIGN KEY ("escritorioId") REFERENCES "offices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "processes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "protocolos" ADD CONSTRAINT "protocolos_advogadoId_fkey"
    FOREIGN KEY ("advogadoId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

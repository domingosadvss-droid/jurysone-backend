-- Cada login conecta o próprio WhatsApp; o dono decide quem mais vê a caixa do número.
ALTER TABLE "whatsapp_conexoes" ADD COLUMN "usuarioId" TEXT;
ALTER TABLE "whatsapp_conexoes" ADD COLUMN "acessoIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "whatsapp_conexoes" ADD COLUMN "iaAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_conexoes" ADD COLUMN "iaAtivadoEm" TIMESTAMP(3);
CREATE INDEX "whatsapp_conexoes_usuarioId_idx" ON "whatsapp_conexoes"("usuarioId");

-- Conexões que já existiam eram do escritório inteiro: passam a ser do administrador mais antigo
-- (quem conectou o número). Ele pode liberar o acesso a outros depois.
UPDATE "whatsapp_conexoes" c
SET "usuarioId" = (
  SELECT u."id" FROM "users" u
  WHERE u."escritorioId" = c."escritorioId" AND u."roles" ILIKE '%ADMIN%'
  ORDER BY u."createdAt" ASC LIMIT 1
)
WHERE c."usuarioId" IS NULL;

-- O interruptor geral da IA (configuração do escritório) passa para cada número
UPDATE "whatsapp_conexoes" c
SET "iaAtivo" = COALESCE((cfg."valor"->>'ativo')::boolean, false),
    "iaAtivadoEm" = NULLIF(cfg."valor"->>'ativadoEm', '')::timestamp
FROM "settings" cfg
WHERE cfg."escritorioId" = c."escritorioId" AND cfg."chave" = 'ia_whatsapp' AND c."ativo" = true;

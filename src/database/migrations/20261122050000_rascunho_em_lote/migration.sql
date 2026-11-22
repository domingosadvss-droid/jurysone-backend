-- Rascunhos de peça sem urgência vão pelo lote da Anthropic (metade do preço)
ALTER TABLE "rascunhos_peca" ADD COLUMN "loteId" TEXT;
ALTER TABLE "rascunhos_peca" ADD COLUMN "loteEnviadoEm" TIMESTAMP(3);

-- Conversas longas do WhatsApp: a IA guarda um resumo do começo e relê só o fim
ALTER TABLE "whatsapp_conversas" ADD COLUMN "resumoIa" TEXT;
ALTER TABLE "whatsapp_conversas" ADD COLUMN "resumoAte" TIMESTAMP(3);

-- Atendimento automático do WhatsApp (IA): situação por conversa e motivo do encaminhamento (aditiva)
ALTER TABLE "whatsapp_conversas" ADD COLUMN "iaStatus" TEXT;
ALTER TABLE "whatsapp_conversas" ADD COLUMN "iaMotivo" TEXT;

-- AddColumn zapsignDocumentId to esign_envelopes
ALTER TABLE "esign_envelopes" ADD COLUMN "zapsignDocumentId" TEXT UNIQUE;

-- AddColumn externalDocumentId to esign_envelopes
ALTER TABLE "esign_envelopes" ADD COLUMN "externalDocumentId" TEXT;

-- AddColumn urlDocumentoAssinado to esign_envelopes
ALTER TABLE "esign_envelopes" ADD COLUMN "urlDocumentoAssinado" TEXT;

-- AddColumn dataRejeicao to esign_envelopes
ALTER TABLE "esign_envelopes" ADD COLUMN "dataRejeicao" TIMESTAMP(3);

-- AddColumn motivoRejeicao to esign_envelopes
ALTER TABLE "esign_envelopes" ADD COLUMN "motivoRejeicao" TEXT;

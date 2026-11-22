-- CPF do usuário (advogado), usado para assinar com certificado digital na Certisign (aditiva)
ALTER TABLE "users" ADD COLUMN "cpf" TEXT;

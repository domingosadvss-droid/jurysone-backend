-- "Esqueceu a senha?": código de redefinição (só o hash) e validade (aditiva)
ALTER TABLE "users" ADD COLUMN "resetSenhaHash" TEXT;
ALTER TABLE "users" ADD COLUMN "resetSenhaExpiraEm" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_resetSenhaHash_key" ON "users"("resetSenhaHash");

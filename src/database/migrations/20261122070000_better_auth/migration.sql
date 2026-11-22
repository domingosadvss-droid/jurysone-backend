-- Login pelo Better Auth (22/11/2026): senha, Google, "esqueci a senha" e verificação em duas etapas.
-- O usuário do Better Auth é a própria tabela "users" (name -> nome, image -> avatarUrl).

ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ba_sessoes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ba_sessoes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ba_sessoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ba_sessoes_token_key" ON "ba_sessoes"("token");
CREATE INDEX "ba_sessoes_userId_idx" ON "ba_sessoes"("userId");

CREATE TABLE "ba_contas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ba_contas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ba_contas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "ba_contas_userId_idx" ON "ba_contas"("userId");
CREATE UNIQUE INDEX "ba_contas_provider_conta_key" ON "ba_contas"("providerId", "accountId");

CREATE TABLE "ba_verificacoes" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ba_verificacoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ba_verificacoes_identifier_idx" ON "ba_verificacoes"("identifier");

CREATE TABLE "ba_dois_fatores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    CONSTRAINT "ba_dois_fatores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ba_dois_fatores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "ba_dois_fatores_userId_idx" ON "ba_dois_fatores"("userId");

-- As senhas atuais (argon2) viram a conta "credential" do Better Auth: ninguém troca de senha.
INSERT INTO "ba_contas" ("id", "userId", "accountId", "providerId", "password", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", u."id", 'credential', u."senha", now(), now()
FROM "users" u
WHERE u."senha" IS NOT NULL AND u."senha" <> '';

-- Quem grava a senha na tabela antiga (cadastro da equipe, seed) mantém a conta do Better Auth igual.
CREATE OR REPLACE FUNCTION jurysone_sincronizar_senha() RETURNS trigger AS $$
BEGIN
  IF NEW."senha" IS NULL OR NEW."senha" = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."senha" IS NOT DISTINCT FROM OLD."senha" THEN
    RETURN NEW;
  END IF;
  INSERT INTO "ba_contas" ("id", "userId", "accountId", "providerId", "password", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, NEW."id", NEW."id", 'credential', NEW."senha", now(), now())
  ON CONFLICT ("providerId", "accountId") DO UPDATE SET "password" = EXCLUDED."password", "updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_sincronizar_senha"
AFTER INSERT OR UPDATE OF "senha" ON "users"
FOR EACH ROW EXECUTE FUNCTION jurysone_sincronizar_senha();

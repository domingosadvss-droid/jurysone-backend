-- ============================================================================
--  JURYSONE — Banco de Dados PostgreSQL Completo
--  Versão: 2.0
--  Gerado: 2026-03-18
--  Relação central: ESCRITORIO → USUARIO → CLIENTE → ATENDIMENTO → PROCESSO
--                   → DOCUMENTOS → ASSINATURA → FINANCEIRO → AGENDA / TAREFAS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSÕES
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";        -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";         -- crypt(), gen_salt()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";          -- busca textual fuzzy
CREATE EXTENSION IF NOT EXISTS "unaccent";         -- normalização de acentos

-- ---------------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------------

CREATE TYPE user_role          AS ENUM ('ADMIN','ADVOGADO','ESTAGIARIO','SECRETARIA');
CREATE TYPE client_type        AS ENUM ('PF','PJ');
CREATE TYPE process_status     AS ENUM ('ATIVO','ARQUIVADO','ENCERRADO','SUSPENSO');
CREATE TYPE task_status        AS ENUM ('PENDING','IN_PROGRESS','DONE','CANCELLED');
CREATE TYPE task_priority      AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
CREATE TYPE calendar_type      AS ENUM ('PRAZO','AUDIENCIA','REUNIAO','TAREFA','OUTRO');
CREATE TYPE payment_status     AS ENUM ('PENDING','PAID','FAILED','REFUNDED');
CREATE TYPE payment_method     AS ENUM ('CREDIT_CARD','BOLETO','PIX','DINHEIRO','TRANSFERENCIA');
CREATE TYPE subscription_status AS ENUM ('TRIAL','ACTIVE','PAST_DUE','CANCELED','PAUSED');
CREATE TYPE atendimento_status AS ENUM (
  'NOVO','AGUARDANDO_ASSINATURA','AGUARDANDO_PAGAMENTO',
  'ATIVO','CONCLUIDO','CANCELADO'
);
CREATE TYPE financeiro_tipo    AS ENUM ('HONORARIO','DESPESA','REEMBOLSO','PARCELA');
CREATE TYPE financeiro_status  AS ENUM ('PENDENTE','PAGO','VENCIDO','CANCELADO');
CREATE TYPE doc_status         AS ENUM ('PENDENTE','GERADO','ASSINADO','ARQUIVADO');
CREATE TYPE esign_status       AS ENUM ('draft','sent','signed','expired','cancelled');
CREATE TYPE esign_signer_status AS ENUM ('pendente','assinado','recusado');
CREATE TYPE automacao_status   AS ENUM ('sucesso','erro','parcial');

-- ---------------------------------------------------------------------------
-- 2. FUNÇÃO AUXILIAR — atualiza updated_at automaticamente
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Macro para criar trigger de updated_at (reutilizada abaixo)
-- Uso: SELECT create_updated_at_trigger('nome_da_tabela');
CREATE OR REPLACE FUNCTION create_updated_at_trigger(tbl TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_%s_updated_at
     BEFORE UPDATE ON %I
     FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
    tbl, tbl
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. ESCRITÓRIOS  (multi-tenant root)
-- ---------------------------------------------------------------------------

CREATE TABLE escritorios (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT        NOT NULL,
  cnpj            TEXT        UNIQUE,
  logo_url        TEXT,
  dominio         TEXT        UNIQUE,                   -- white-label
  cor_primaria    TEXT,
  plano           TEXT        NOT NULL DEFAULT 'PRO',
  status          subscription_status NOT NULL DEFAULT 'TRIAL',
  trial_ate       TIMESTAMPTZ,
  periodo_inicio  TIMESTAMPTZ,
  periodo_fim     TIMESTAMPTZ,
  cancelado_em    TIMESTAMPTZ,
  stripe_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('escritorios');

-- ---------------------------------------------------------------------------
-- 4. USUARIOS
-- ---------------------------------------------------------------------------

CREATE TABLE usuarios (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id       UUID        NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  nome                TEXT        NOT NULL,
  email               TEXT        NOT NULL UNIQUE,
  senha_hash          TEXT        NOT NULL,
  oab_numero          TEXT,
  oab_uf              TEXT        CHECK (oab_uf ~ '^[A-Z]{2}$'),
  telefone            TEXT,
  avatar_url          TEXT,
  perfil              user_role   NOT NULL DEFAULT 'ADVOGADO',
  ativo               BOOLEAN     NOT NULL DEFAULT TRUE,
  email_verificado_em TIMESTAMPTZ,
  dois_fatores_secret TEXT,
  ultimo_login_em     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('usuarios');

CREATE INDEX idx_usuarios_escritorio ON usuarios(escritorio_id);
CREATE INDEX idx_usuarios_email      ON usuarios(email);

-- ---------------------------------------------------------------------------
-- 5. CLIENTES
-- ---------------------------------------------------------------------------

CREATE TABLE clientes (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id   UUID        NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  nome            TEXT        NOT NULL,
  tipo            client_type NOT NULL DEFAULT 'PF',
  cpf_cnpj        TEXT,
  rg              TEXT,
  data_nascimento DATE,
  telefone        TEXT,
  email           TEXT,
  -- Endereço desnormalizado para simplicidade + JSONB para flexibilidade
  cep             TEXT,
  rua             TEXT,
  numero          TEXT,
  complemento     TEXT,
  bairro          TEXT,
  cidade          TEXT,
  estado          TEXT        CHECK (estado ~ '^[A-Z]{2}$'),
  endereco_extra  JSONB,                                -- campos adicionais
  observacoes     TEXT,
  ativo           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- CPF/CNPJ único por escritório
  UNIQUE (escritorio_id, cpf_cnpj)
);

SELECT create_updated_at_trigger('clientes');

CREATE INDEX idx_clientes_escritorio ON clientes(escritorio_id);
CREATE INDEX idx_clientes_cpf_cnpj   ON clientes(cpf_cnpj);
-- Busca fuzzy por nome
CREATE INDEX idx_clientes_nome_trgm  ON clientes USING GIN (nome gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 6. MENORES (dependentes representados no atendimento)
-- ---------------------------------------------------------------------------

CREATE TABLE menores (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id       UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  data_nascimento  DATE NOT NULL,
  cpf              TEXT,
  rg               TEXT,
  tipo_responsavel TEXT NOT NULL DEFAULT 'mae' -- pai | mae | tutor
    CHECK (tipo_responsavel IN ('pai','mae','tutor','outro')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_menores_cliente ON menores(cliente_id);

-- ---------------------------------------------------------------------------
-- 7. PROCESSOS
-- ---------------------------------------------------------------------------

CREATE TABLE processos (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id   UUID           NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  cliente_id      UUID           NOT NULL REFERENCES clientes(id)    ON DELETE RESTRICT,
  responsavel_id  UUID           REFERENCES usuarios(id) ON DELETE SET NULL,
  numero_processo TEXT,
  tribunal        TEXT,
  area            TEXT           NOT NULL,       -- Trabalhista, Família, etc.
  tipo_acao       TEXT           NOT NULL,
  status          process_status NOT NULL DEFAULT 'ATIVO',
  valor_causa     NUMERIC(15,2)  CHECK (valor_causa >= 0),
  campos_extras   JSONB,                         -- metadados livres
  iniciado_em     TIMESTAMPTZ,
  encerrado_em    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('processos');

CREATE INDEX idx_processos_escritorio   ON processos(escritorio_id);
CREATE INDEX idx_processos_cliente      ON processos(cliente_id);
CREATE INDEX idx_processos_responsavel  ON processos(responsavel_id);
CREATE INDEX idx_processos_numero       ON processos(numero_processo);
CREATE INDEX idx_processos_status       ON processos(status);
-- Busca fuzzy no número
CREATE INDEX idx_processos_num_trgm     ON processos USING GIN (numero_processo gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 8. ATENDIMENTOS  (intake completo — conecta tudo)
-- ---------------------------------------------------------------------------

CREATE TABLE atendimentos (
  id              UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id   UUID               NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  cliente_id      UUID               NOT NULL REFERENCES clientes(id)    ON DELETE RESTRICT,
  processo_id     UUID               REFERENCES processos(id) ON DELETE SET NULL,
  menor_id        UUID               REFERENCES menores(id)  ON DELETE SET NULL,
  criado_por_id   UUID               REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo_representacao TEXT            NOT NULL DEFAULT 'proprio'
    CHECK (tipo_representacao IN ('proprio','menor')),
  status          atendimento_status NOT NULL DEFAULT 'NOVO',
  origem          TEXT               NOT NULL DEFAULT 'formulario'
    CHECK (origem IN ('formulario','whatsapp','telefone','indicacao','site')),
  -- Honorários (capturado no intake)
  tipo_honorario  TEXT               NOT NULL DEFAULT 'fixo'
    CHECK (tipo_honorario IN ('fixo','percentual','fixo_sucesso')),
  valor_fixo      NUMERIC(15,2)      CHECK (valor_fixo >= 0),
  percentual_exito NUMERIC(5,2)      CHECK (percentual_exito BETWEEN 0 AND 100),
  forma_pagamento TEXT,
  parcelamento    BOOLEAN            DEFAULT FALSE,
  num_parcelas    INT                CHECK (num_parcelas > 0),
  vencimento_1parc DATE,
  -- Questionário livre (armazenado como JSON)
  questionario    JSONB,
  -- Controle de assinatura
  envelope_id     UUID,              -- FK preenchida após criar esign_envelopes
  -- Controle financeiro
  lancamento_id   UUID,              -- FK preenchida após criar financeiro_lancamentos
  mensagem_envelope TEXT,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('atendimentos');

CREATE INDEX idx_atendimentos_escritorio ON atendimentos(escritorio_id);
CREATE INDEX idx_atendimentos_cliente    ON atendimentos(cliente_id);
CREATE INDEX idx_atendimentos_processo   ON atendimentos(processo_id);
CREATE INDEX idx_atendimentos_status     ON atendimentos(status);
CREATE INDEX idx_atendimentos_created    ON atendimentos(created_at DESC);

-- ---------------------------------------------------------------------------
-- 9. ANDAMENTOS DO PROCESSO  (movimentações DataJud / manuais)
-- ---------------------------------------------------------------------------

CREATE TABLE andamentos (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  processo_id UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  data        TIMESTAMPTZ NOT NULL,
  descricao   TEXT        NOT NULL,
  fonte       TEXT        NOT NULL DEFAULT 'manual'
    CHECK (fonte IN ('manual','datajud','pje','tribunal')),
  lido        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_andamentos_processo ON andamentos(processo_id);
CREATE INDEX idx_andamentos_data     ON andamentos(data DESC);

-- ---------------------------------------------------------------------------
-- 10. TAREFAS
-- ---------------------------------------------------------------------------

CREATE TABLE tarefas (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id   UUID          NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  processo_id     UUID          REFERENCES processos(id) ON DELETE SET NULL,
  atendimento_id  UUID          REFERENCES atendimentos(id) ON DELETE SET NULL,
  responsavel_id  UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  titulo          TEXT          NOT NULL,
  descricao       TEXT,
  status          task_status   NOT NULL DEFAULT 'PENDING',
  prioridade      task_priority NOT NULL DEFAULT 'MEDIUM',
  prazo           DATE,
  concluida_em    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('tarefas');

CREATE INDEX idx_tarefas_escritorio   ON tarefas(escritorio_id);
CREATE INDEX idx_tarefas_processo     ON tarefas(processo_id);
CREATE INDEX idx_tarefas_responsavel  ON tarefas(responsavel_id);
CREATE INDEX idx_tarefas_status       ON tarefas(status);
CREATE INDEX idx_tarefas_prazo        ON tarefas(prazo);

-- ---------------------------------------------------------------------------
-- 11. AGENDA  (compromissos, prazos, audiências)
-- ---------------------------------------------------------------------------

CREATE TABLE agenda (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id   UUID          NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  processo_id     UUID          REFERENCES processos(id)    ON DELETE SET NULL,
  atendimento_id  UUID          REFERENCES atendimentos(id) ON DELETE SET NULL,
  cliente_id      UUID          REFERENCES clientes(id)     ON DELETE SET NULL,
  criado_por_id   UUID          REFERENCES usuarios(id)     ON DELETE SET NULL,
  titulo          TEXT          NOT NULL,
  descricao       TEXT,
  tipo            calendar_type NOT NULL DEFAULT 'PRAZO',
  data_inicio     TIMESTAMPTZ   NOT NULL,
  data_fim        TIMESTAMPTZ,
  dia_inteiro     BOOLEAN       NOT NULL DEFAULT FALSE,
  local           TEXT,
  notificar_em    TIMESTAMPTZ,
  notificado      BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT agenda_data_check CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

SELECT create_updated_at_trigger('agenda');

CREATE INDEX idx_agenda_escritorio  ON agenda(escritorio_id);
CREATE INDEX idx_agenda_data_inicio ON agenda(data_inicio);
CREATE INDEX idx_agenda_processo    ON agenda(processo_id);
CREATE INDEX idx_agenda_notificar   ON agenda(notificar_em) WHERE notificado = FALSE;

-- ---------------------------------------------------------------------------
-- 12. FINANCEIRO — LANÇAMENTOS (honorários, parcelas, despesas)
-- ---------------------------------------------------------------------------

CREATE TABLE financeiro_lancamentos (
  id              UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id   UUID              NOT NULL REFERENCES escritorios(id)  ON DELETE RESTRICT,
  cliente_id      UUID              NOT NULL REFERENCES clientes(id)     ON DELETE RESTRICT,
  processo_id     UUID              REFERENCES processos(id)     ON DELETE SET NULL,
  atendimento_id  UUID              REFERENCES atendimentos(id)  ON DELETE SET NULL,
  tipo            financeiro_tipo   NOT NULL DEFAULT 'HONORARIO',
  descricao       TEXT,
  valor           NUMERIC(15,2)     NOT NULL CHECK (valor > 0),
  forma_pagamento payment_method,
  status          financeiro_status NOT NULL DEFAULT 'PENDENTE',
  data_vencimento DATE,
  data_pagamento  DATE,
  num_parcela     INT,
  total_parcelas  INT,
  asaas_id        TEXT              UNIQUE,        -- ID do charge no Asaas
  gateway_url     TEXT,                            -- link de boleto / pix
  comprovante_url TEXT,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('financeiro_lancamentos');

CREATE INDEX idx_financeiro_escritorio   ON financeiro_lancamentos(escritorio_id);
CREATE INDEX idx_financeiro_cliente      ON financeiro_lancamentos(cliente_id);
CREATE INDEX idx_financeiro_processo     ON financeiro_lancamentos(processo_id);
CREATE INDEX idx_financeiro_atendimento  ON financeiro_lancamentos(atendimento_id);
CREATE INDEX idx_financeiro_status       ON financeiro_lancamentos(status);
CREATE INDEX idx_financeiro_vencimento   ON financeiro_lancamentos(data_vencimento);

-- ---------------------------------------------------------------------------
-- 13. DOCUMENTOS
-- ---------------------------------------------------------------------------

CREATE TABLE documentos (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id   UUID        NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  cliente_id      UUID        REFERENCES clientes(id)     ON DELETE SET NULL,
  processo_id     UUID        REFERENCES processos(id)    ON DELETE SET NULL,
  atendimento_id  UUID        REFERENCES atendimentos(id) ON DELETE SET NULL,
  nome            TEXT        NOT NULL,
  tipo            TEXT        NOT NULL,              -- contrato, procuracao, peticao, etc.
  mime_type       TEXT,
  tamanho_bytes   BIGINT,
  url             TEXT,
  versao          INT         NOT NULL DEFAULT 1,
  status          doc_status  NOT NULL DEFAULT 'PENDENTE',
  categoria       TEXT,
  hash_sha256     TEXT,                              -- integridade
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documentos_escritorio   ON documentos(escritorio_id);
CREATE INDEX idx_documentos_processo     ON documentos(processo_id);
CREATE INDEX idx_documentos_atendimento  ON documentos(atendimento_id);
CREATE INDEX idx_documentos_status       ON documentos(status);

-- ---------------------------------------------------------------------------
-- 14. ASSINATURAS ELETRÔNICAS — ENVELOPES  (ZapSign / ICP-Brasil)
-- ---------------------------------------------------------------------------

CREATE TABLE esign_envelopes (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id    UUID         NOT NULL REFERENCES escritorios(id) ON DELETE RESTRICT,
  atendimento_id   UUID         REFERENCES atendimentos(id) ON DELETE SET NULL,
  documento_id     UUID         REFERENCES documentos(id)   ON DELETE SET NULL,
  criado_por_id    UUID         REFERENCES usuarios(id)     ON DELETE SET NULL,
  titulo           TEXT         NOT NULL,
  tipo             TEXT         NOT NULL DEFAULT 'simples'
    CHECK (tipo IN ('simples','icp_brasil')),
  status           esign_status NOT NULL DEFAULT 'draft',
  documento_url    TEXT,
  documento_hash   TEXT,
  expira_em        TIMESTAMPTZ,
  mensagem         TEXT,
  cancelado_motivo TEXT,
  -- Referências externas
  zapsign_token    TEXT         UNIQUE,
  zapsign_short_url TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('esign_envelopes');

CREATE INDEX idx_esign_envelopes_escritorio   ON esign_envelopes(escritorio_id);
CREATE INDEX idx_esign_envelopes_atendimento  ON esign_envelopes(atendimento_id);
CREATE INDEX idx_esign_envelopes_status       ON esign_envelopes(status);

-- ---------------------------------------------------------------------------
-- 15. ASSINATURAS — SIGNATÁRIOS
-- ---------------------------------------------------------------------------

CREATE TABLE esign_signatarios (
  id                  UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
  envelope_id         UUID                NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
  nome                TEXT                NOT NULL,
  email               TEXT                NOT NULL,
  cpf                 TEXT,
  papel               TEXT                NOT NULL DEFAULT 'signatario'
    CHECK (papel IN ('signatario','aprovador','testemunha','notificado')),
  ordem               INT                 NOT NULL DEFAULT 1,
  notificacao         TEXT                NOT NULL DEFAULT 'email',
  status              esign_signer_status NOT NULL DEFAULT 'pendente',
  token               TEXT                UNIQUE DEFAULT uuid_generate_v4()::TEXT,
  token_expira_em     TIMESTAMPTZ,
  assinado_em         TIMESTAMPTZ,
  assinatura_desenho  TEXT,               -- base64 ou URL
  ip                  TEXT,
  user_agent          TEXT,
  geo_lat             NUMERIC(10,7),
  geo_lng             NUMERIC(10,7),
  motivo_recusa       TEXT,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signatarios_envelope ON esign_signatarios(envelope_id);
CREATE INDEX idx_signatarios_email    ON esign_signatarios(email);

-- ---------------------------------------------------------------------------
-- 16. ASSINATURAS — AUDITORIA
-- ---------------------------------------------------------------------------

CREATE TABLE esign_auditoria (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  envelope_id UUID        NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
  acao        TEXT        NOT NULL
    CHECK (acao IN ('criado','enviado','visualizado','assinado','recusado','cancelado','expirado')),
  descricao   TEXT        NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_esign_auditoria_envelope ON esign_auditoria(envelope_id);
CREATE INDEX idx_esign_auditoria_created  ON esign_auditoria(created_at DESC);

-- ---------------------------------------------------------------------------
-- 17. FK circulares — resolvidas após criação das tabelas
-- ---------------------------------------------------------------------------

-- atendimentos.envelope_id → esign_envelopes
ALTER TABLE atendimentos
  ADD CONSTRAINT fk_atendimentos_envelope
  FOREIGN KEY (envelope_id) REFERENCES esign_envelopes(id) ON DELETE SET NULL;

-- atendimentos.lancamento_id → financeiro_lancamentos
ALTER TABLE atendimentos
  ADD CONSTRAINT fk_atendimentos_lancamento
  FOREIGN KEY (lancamento_id) REFERENCES financeiro_lancamentos(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 18. AUTOMAÇÕES
-- ---------------------------------------------------------------------------

CREATE TABLE automacoes (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id UUID        NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  criado_por_id UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  nome          TEXT        NOT NULL,
  descricao     TEXT,
  ativa         BOOLEAN     NOT NULL DEFAULT TRUE,
  evento        TEXT        NOT NULL,              -- gatilho ex: atendimento_criado
  condicoes     JSONB       NOT NULL DEFAULT '[]', -- array de condições
  acoes         JSONB       NOT NULL DEFAULT '[]', -- array de ações em ordem
  execucoes     INT         NOT NULL DEFAULT 0,
  erros         INT         NOT NULL DEFAULT 0,
  ultima_exec   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('automacoes');

CREATE INDEX idx_automacoes_escritorio ON automacoes(escritorio_id);
CREATE INDEX idx_automacoes_evento     ON automacoes(evento) WHERE ativa = TRUE;

-- ---------------------------------------------------------------------------
-- 19. LOGS DE AUTOMAÇÃO
-- ---------------------------------------------------------------------------

CREATE TABLE automacao_logs (
  id            UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  automacao_id  UUID              NOT NULL REFERENCES automacoes(id) ON DELETE CASCADE,
  status        automacao_status  NOT NULL,
  input         JSONB,
  output        JSONB,
  erro_msg      TEXT,
  duracao_ms    INT,
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automacao_logs_automacao ON automacao_logs(automacao_id);
CREATE INDEX idx_automacao_logs_created   ON automacao_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- 20. NOTIFICAÇÕES
-- ---------------------------------------------------------------------------

CREATE TABLE notificacoes (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id UUID      NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  usuario_id  UUID        NOT NULL REFERENCES usuarios(id)    ON DELETE CASCADE,
  tipo        TEXT        NOT NULL,
  titulo      TEXT        NOT NULL,
  mensagem    TEXT        NOT NULL,
  dados       JSONB,
  link        TEXT,
  prioridade  TEXT        NOT NULL DEFAULT 'normal'
    CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  lida        BOOLEAN     NOT NULL DEFAULT FALSE,
  lida_em     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notificacoes_usuario ON notificacoes(usuario_id, lida);
CREATE INDEX idx_notificacoes_created ON notificacoes(created_at DESC);

-- ---------------------------------------------------------------------------
-- 21. WHATSAPP — MENSAGENS
-- ---------------------------------------------------------------------------

CREATE TABLE whatsapp_mensagens (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id   UUID        NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  cliente_id      UUID        REFERENCES clientes(id)   ON DELETE SET NULL,
  processo_id     UUID        REFERENCES processos(id)  ON DELETE SET NULL,
  enviado_por_id  UUID        REFERENCES usuarios(id)   ON DELETE SET NULL,
  telefone        TEXT        NOT NULL,
  tipo            TEXT        NOT NULL DEFAULT 'texto'
    CHECK (tipo IN ('texto','documento','template','imagem','audio')),
  conteudo        TEXT,
  template_id     TEXT,
  variaveis       JSONB,
  wa_msg_id       TEXT        UNIQUE,              -- ID externo WhatsApp/Evolution
  status          TEXT        NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviada','entregue','lida','erro')),
  erro_mensagem   TEXT,
  enviado_em      TIMESTAMPTZ,
  lida_em         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wa_mensagens_escritorio ON whatsapp_mensagens(escritorio_id);
CREATE INDEX idx_wa_mensagens_cliente    ON whatsapp_mensagens(cliente_id);
CREATE INDEX idx_wa_mensagens_telefone   ON whatsapp_mensagens(telefone);

-- ---------------------------------------------------------------------------
-- 22. DATAJUD — MONITORAMENTOS
-- ---------------------------------------------------------------------------

CREATE TABLE datajud_monitoramentos (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id       UUID        NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  processo_id         UUID        NOT NULL REFERENCES processos(id)   ON DELETE CASCADE,
  ativo               BOOLEAN     NOT NULL DEFAULT TRUE,
  alertar_movimentacao BOOLEAN    NOT NULL DEFAULT TRUE,
  alertar_prazo       BOOLEAN     NOT NULL DEFAULT TRUE,
  usuarios_alertar    JSONB,                          -- array de user_ids
  ultima_sync         TIMESTAMPTZ,
  total_andamentos    INT         NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (escritorio_id, processo_id)
);

SELECT create_updated_at_trigger('datajud_monitoramentos');

-- ---------------------------------------------------------------------------
-- 23. TIME TRACKING
-- ---------------------------------------------------------------------------

CREATE TABLE time_entries (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id   UUID        NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id)    ON DELETE CASCADE,
  processo_id     UUID        REFERENCES processos(id) ON DELETE SET NULL,
  tarefa_id       UUID        REFERENCES tarefas(id)   ON DELETE SET NULL,
  descricao       TEXT        NOT NULL,
  inicio          TIMESTAMPTZ NOT NULL,
  fim             TIMESTAMPTZ,
  duracao_min     INT         GENERATED ALWAYS AS (
    CASE WHEN fim IS NOT NULL
      THEN EXTRACT(EPOCH FROM (fim - inicio))::INT / 60
      ELSE NULL END
  ) STORED,
  faturavel       BOOLEAN     NOT NULL DEFAULT TRUE,
  categoria       TEXT,
  status          TEXT        NOT NULL DEFAULT 'registrado'
    CHECK (status IN ('registrado','faturado','cancelado')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT time_entries_fim_check CHECK (fim IS NULL OR fim >= inicio)
);

SELECT create_updated_at_trigger('time_entries');

CREATE INDEX idx_time_entries_usuario  ON time_entries(usuario_id);
CREATE INDEX idx_time_entries_processo ON time_entries(processo_id);
CREATE INDEX idx_time_entries_inicio   ON time_entries(inicio DESC);

-- ---------------------------------------------------------------------------
-- 24. PORTAL DO CLIENTE
-- ---------------------------------------------------------------------------

CREATE TABLE portal_usuarios (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id      UUID        NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL UNIQUE,
  senha_hash      TEXT,
  invite_token    TEXT        UNIQUE,
  invite_expira   TIMESTAMPTZ,
  ativado_em      TIMESTAMPTZ,
  ativo           BOOLEAN     NOT NULL DEFAULT FALSE,
  ultimo_login    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('portal_usuarios');

CREATE TABLE portal_mensagens (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  portal_uid    UUID        REFERENCES portal_usuarios(id) ON DELETE SET NULL,
  processo_id   UUID        REFERENCES processos(id) ON DELETE SET NULL,
  usuario_id    UUID        REFERENCES usuarios(id)  ON DELETE SET NULL,
  conteudo      TEXT        NOT NULL,
  anexo_url     TEXT,
  remetente     TEXT        NOT NULL CHECK (remetente IN ('cliente','advogado')),
  lida          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portal_msgs_processo ON portal_mensagens(processo_id);

-- ---------------------------------------------------------------------------
-- 25. AUDIT LOG  (imutável — sem UPDATE nem DELETE)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id          BIGSERIAL   PRIMARY KEY,
  escritorio_id UUID      REFERENCES escritorios(id) ON DELETE SET NULL,
  usuario_id  UUID        REFERENCES usuarios(id)    ON DELETE SET NULL,
  acao        TEXT        NOT NULL,
  entidade    TEXT,
  entidade_id TEXT,
  ip          TEXT,
  user_agent  TEXT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_escritorio ON audit_logs(escritorio_id);
CREATE INDEX idx_audit_usuario    ON audit_logs(usuario_id);
CREATE INDEX idx_audit_created    ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_entidade   ON audit_logs(entidade, entidade_id);

-- Impede UPDATE e DELETE no audit log
CREATE RULE audit_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ---------------------------------------------------------------------------
-- 26. REFRESH TOKENS  (autenticação JWT)
-- ---------------------------------------------------------------------------

CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id  UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  expira_em   TIMESTAMPTZ NOT NULL,
  revogado    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_token   ON refresh_tokens(token) WHERE revogado = FALSE;
CREATE INDEX idx_refresh_tokens_usuario ON refresh_tokens(usuario_id);

-- ---------------------------------------------------------------------------
-- 27. CONFIGURAÇÕES POR ESCRITÓRIO
-- ---------------------------------------------------------------------------

CREATE TABLE configuracoes (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id UUID        NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  chave         TEXT        NOT NULL,
  valor         JSONB       NOT NULL,
  tipo          TEXT        NOT NULL DEFAULT 'global',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (escritorio_id, chave)
);

SELECT create_updated_at_trigger('configuracoes');

-- ---------------------------------------------------------------------------
-- 28. NPS  (Net Promoter Score)
-- ---------------------------------------------------------------------------

CREATE TABLE nps_respostas (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  escritorio_id UUID        NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  portal_uid    UUID        NOT NULL REFERENCES portal_usuarios(id) ON DELETE CASCADE,
  score         INT         NOT NULL CHECK (score BETWEEN 0 AND 10),
  comentario    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nps_escritorio ON nps_respostas(escritorio_id);

-- ---------------------------------------------------------------------------
-- 29. HISTÓRICO DE STATUS  (trilha de transições — imutável)
-- ---------------------------------------------------------------------------

CREATE TABLE status_history (
  id             BIGSERIAL   PRIMARY KEY,
  entidade       TEXT        NOT NULL,   -- 'atendimento' | 'processo' | 'lancamento_financeiro' | 'esign_envelope'
  entidade_id    TEXT        NOT NULL,
  status_anterior TEXT,
  status_novo    TEXT        NOT NULL,
  origem         TEXT        NOT NULL,   -- 'webhook_esign' | 'webhook_pagamento' | 'sistema' | 'usuario' | 'cron'
  metadata       JSONB,
  usuario_id     UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_hist_entidade ON status_history(entidade, entidade_id);
CREATE INDEX idx_status_hist_ts       ON status_history(timestamp DESC);

-- Impede UPDATE e DELETE (log imutável)
CREATE RULE status_history_no_update AS ON UPDATE TO status_history DO INSTEAD NOTHING;
CREATE RULE status_history_no_delete AS ON DELETE TO status_history DO INSTEAD NOTHING;

COMMENT ON TABLE status_history IS 'Trilha imutável de todas as transições de status do sistema.';

-- ---------------------------------------------------------------------------
-- 30. VIEWS UTILITÁRIAS
-- ---------------------------------------------------------------------------

-- Dashboard: atendimentos com dados principais
CREATE OR REPLACE VIEW v_atendimentos AS
SELECT
  a.id,
  a.escritorio_id,
  a.status,
  a.tipo_honorario,
  a.valor_fixo,
  a.percentual_exito,
  a.forma_pagamento,
  a.created_at,
  c.nome         AS cliente_nome,
  c.cpf_cnpj     AS cliente_cpf_cnpj,
  c.email        AS cliente_email,
  c.telefone     AS cliente_telefone,
  p.numero_processo,
  p.area,
  p.tipo_acao,
  p.valor_causa,
  p.status       AS processo_status,
  fl.valor       AS valor_lancamento,
  fl.status      AS financeiro_status,
  fl.data_vencimento,
  ee.status      AS esign_status,
  ee.zapsign_short_url
FROM atendimentos a
JOIN clientes    c  ON c.id = a.cliente_id
LEFT JOIN processos p  ON p.id = a.processo_id
LEFT JOIN financeiro_lancamentos fl ON fl.id = a.lancamento_id
LEFT JOIN esign_envelopes ee ON ee.id = a.envelope_id;

-- Financeiro: inadimplentes
CREATE OR REPLACE VIEW v_inadimplentes AS
SELECT
  fl.*,
  c.nome  AS cliente_nome,
  c.email AS cliente_email,
  c.telefone AS cliente_telefone,
  p.numero_processo,
  (CURRENT_DATE - fl.data_vencimento) AS dias_atraso
FROM financeiro_lancamentos fl
JOIN clientes c ON c.id = fl.cliente_id
LEFT JOIN processos p ON p.id = fl.processo_id
WHERE fl.status = 'PENDENTE'
  AND fl.data_vencimento < CURRENT_DATE;

-- Agenda: próximos 7 dias
CREATE OR REPLACE VIEW v_agenda_proxima AS
SELECT
  ag.*,
  c.nome  AS cliente_nome,
  p.numero_processo
FROM agenda ag
LEFT JOIN clientes  c ON c.id = ag.cliente_id
LEFT JOIN processos p ON p.id = ag.processo_id
WHERE ag.data_inicio BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY ag.data_inicio;

-- ---------------------------------------------------------------------------
-- 30. DADOS INICIAIS (seed de desenvolvimento)
-- ---------------------------------------------------------------------------

-- Escritório padrão
INSERT INTO escritorios (id, nome, plano, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Jurysone — Escritório Demo',
  'PRO',
  'TRIAL'
) ON CONFLICT DO NOTHING;

-- Usuário admin padrão  (senha: Jurysone@2025)
INSERT INTO usuarios (id, escritorio_id, nome, email, senha_hash, perfil)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Administrador',
  'admin@jurysone.com.br',
  crypt('Jurysone@2025', gen_salt('bf', 12)),
  'ADMIN'
) ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 31. COMENTÁRIOS DE DOCUMENTAÇÃO
-- ---------------------------------------------------------------------------

COMMENT ON TABLE escritorios             IS 'Tenant raiz do sistema. Cada escritório é um tenant isolado.';
COMMENT ON TABLE usuarios                IS 'Advogados, estagiários e secretárias do escritório.';
COMMENT ON TABLE clientes                IS 'Pessoas físicas ou jurídicas atendidas pelo escritório.';
COMMENT ON TABLE menores                 IS 'Crianças/adolescentes representados em atendimentos.';
COMMENT ON TABLE processos               IS 'Processos judiciais ou extrajudiciais vinculados a um cliente.';
COMMENT ON TABLE atendimentos            IS 'Intake completo: agrega cliente, processo, financeiro e assinatura.';
COMMENT ON TABLE andamentos              IS 'Movimentações do processo (DataJud, manuais, tribunais).';
COMMENT ON TABLE tarefas                 IS 'Atividades internas vinculadas a processos ou atendimentos.';
COMMENT ON TABLE agenda                  IS 'Compromissos, prazos e audiências do escritório.';
COMMENT ON TABLE financeiro_lancamentos  IS 'Honorários, parcelas e despesas — integração Asaas.';
COMMENT ON TABLE documentos              IS 'Arquivos gerados ou anexados (contratos, petições, procurações).';
COMMENT ON TABLE esign_envelopes         IS 'Envelopes de assinatura eletrônica — integração ZapSign.';
COMMENT ON TABLE esign_signatarios       IS 'Pessoas convidadas a assinar cada envelope.';
COMMENT ON TABLE esign_auditoria         IS 'Trilha de auditoria imutável dos eventos de assinatura.';
COMMENT ON TABLE automacoes              IS 'Gatilhos e ações automáticas configuráveis por escritório.';
COMMENT ON TABLE automacao_logs          IS 'Histórico de execuções das automações.';
COMMENT ON TABLE notificacoes            IS 'Centro de notificações internas por usuário.';
COMMENT ON TABLE whatsapp_mensagens      IS 'Mensagens enviadas/recebidas via WhatsApp (Evolution API).';
COMMENT ON TABLE datajud_monitoramentos  IS 'Controle de monitoramento automático de processos no DataJud/CNJ.';
COMMENT ON TABLE time_entries            IS 'Registro de horas trabalhadas por processo ou tarefa.';
COMMENT ON TABLE portal_usuarios         IS 'Acesso do cliente ao portal self-service.';
COMMENT ON TABLE audit_logs              IS 'Log de auditoria imutável de todas as ações do sistema.';
COMMENT ON TABLE refresh_tokens          IS 'Tokens de refresh JWT — expiram e podem ser revogados.';
COMMENT ON TABLE configuracoes           IS 'Configurações chave-valor por escritório (JSONB).';

-- ============================================================================
--  FIM DO SCHEMA  —  jurysone/jurysone-backend/database/schema.sql
-- ============================================================================

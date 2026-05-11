-- ============================================================
--  BarberPro SaaS — Schema completo PostgreSQL
--  Execute: psql -U postgres -d barberpro -f schema.sql
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── BARBEARIAS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS barbearias (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          VARCHAR(120)  NOT NULL,
  slug          VARCHAR(80)   UNIQUE NOT NULL,           -- ex: barbearia-do-ze
  email         VARCHAR(255)  UNIQUE NOT NULL,
  telefone      VARCHAR(20),
  endereco      TEXT,
  cidade        VARCHAR(80),
  estado        CHAR(2),
  cep           VARCHAR(10),
  logo_url      TEXT,
  cor_primaria  VARCHAR(7)    DEFAULT '#C9A84C',
  ativo         BOOLEAN       DEFAULT TRUE,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- ─── ASSINATURAS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assinaturas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id        UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  plano               VARCHAR(30)  NOT NULL DEFAULT 'basico',  -- basico | pro | enterprise
  status              VARCHAR(20)  NOT NULL DEFAULT 'trial',   -- trial | ativo | vencido | bloqueado | cancelado
  data_inicio         DATE         NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento     DATE         NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '7 days'),
  data_cancelamento   DATE,
  stripe_customer_id  VARCHAR(100),
  stripe_sub_id       VARCHAR(100),
  mp_subscription_id  VARCHAR(100),
  valor_mensal        NUMERIC(10,2) DEFAULT 0,
  moeda               CHAR(3)       DEFAULT 'BRL',
  trial_usado         BOOLEAN       DEFAULT FALSE,
  created_at          TIMESTAMPTZ   DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

-- ─── USUARIOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id          UUID          REFERENCES barbearias(id) ON DELETE CASCADE,
  nome                  VARCHAR(120)  NOT NULL,
  email                 VARCHAR(255)  UNIQUE NOT NULL,
  senha_hash            TEXT          NOT NULL,
  role                  VARCHAR(20)   NOT NULL DEFAULT 'barbeiro',  -- dono | gerente | barbeiro | cliente
  ativo                 BOOLEAN       DEFAULT TRUE,
  avatar_url            TEXT,
  telefone              VARCHAR(20),
  reset_token           TEXT,
  reset_token_expiry    TIMESTAMPTZ,
  refresh_token         TEXT,
  ultimo_login          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email        ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_barbearia_id ON usuarios(barbearia_id);

-- ─── BARBEIROS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS barbeiros (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID         NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  nome            VARCHAR(120) NOT NULL,
  email           VARCHAR(255),
  telefone        VARCHAR(20),
  foto_url        TEXT,
  especialidades  TEXT[],
  comissao_pct    NUMERIC(5,2) DEFAULT 0,           -- % de comissão
  ativo           BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_barbeiros_barbearia ON barbeiros(barbearia_id);

-- ─── CLIENTES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID         NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  nome            VARCHAR(120) NOT NULL,
  email           VARCHAR(255),
  telefone        VARCHAR(20),
  whatsapp        VARCHAR(20),
  data_nascimento DATE,
  observacoes     TEXT,
  total_visitas   INTEGER      DEFAULT 0,
  ultima_visita   DATE,
  ativo           BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_barbearia  ON clientes(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone   ON clientes(telefone);

-- ─── SERVICOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servicos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID          NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome            VARCHAR(120)  NOT NULL,
  descricao       TEXT,
  preco           NUMERIC(10,2) NOT NULL DEFAULT 0,
  duracao_min     INTEGER       NOT NULL DEFAULT 30,   -- duração em minutos
  categoria       VARCHAR(60),
  icone           VARCHAR(10)   DEFAULT '✂',
  ativo           BOOLEAN       DEFAULT TRUE,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servicos_barbearia ON servicos(barbearia_id);

-- ─── AGENDAMENTOS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendamentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID         NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  cliente_id      UUID         NOT NULL REFERENCES clientes(id)   ON DELETE CASCADE,
  barbeiro_id     UUID         NOT NULL REFERENCES barbeiros(id)  ON DELETE CASCADE,
  servico_id      UUID         NOT NULL REFERENCES servicos(id)   ON DELETE CASCADE,
  data_hora       TIMESTAMPTZ  NOT NULL,
  duracao_min     INTEGER      NOT NULL DEFAULT 30,
  valor           NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          VARCHAR(20)  NOT NULL DEFAULT 'agendado',
    -- agendado | confirmado | em_andamento | concluido | cancelado | no_show
  observacoes     TEXT,
  lembrete_1h_enviado  BOOLEAN DEFAULT FALSE,
  lembrete_2h_enviado  BOOLEAN DEFAULT FALSE,
  lembrete_24h_enviado BOOLEAN DEFAULT FALSE,
  cancelado_por   VARCHAR(20),   -- cliente | barbeiro | sistema
  motivo_cancelamento TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ag_barbearia   ON agendamentos(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_ag_data_hora   ON agendamentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_ag_cliente     ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ag_barbeiro    ON agendamentos(barbeiro_id);
CREATE INDEX IF NOT EXISTS idx_ag_status      ON agendamentos(status);

-- ─── FINANCEIRO ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financeiro (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID          NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  agendamento_id  UUID          REFERENCES agendamentos(id) ON DELETE SET NULL,
  tipo            VARCHAR(20)   NOT NULL,   -- receita | despesa
  categoria       VARCHAR(60),
  descricao       TEXT          NOT NULL,
  valor           NUMERIC(10,2) NOT NULL,
  data            DATE          NOT NULL DEFAULT CURRENT_DATE,
  forma_pagamento VARCHAR(30),   -- dinheiro | pix | cartao_debito | cartao_credito
  comprovante_url TEXT,
  criado_por      UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_barbearia ON financeiro(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_fin_data      ON financeiro(data);
CREATE INDEX IF NOT EXISTS idx_fin_tipo      ON financeiro(tipo);

-- ─── ESTOQUE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estoque (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID          NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome            VARCHAR(120)  NOT NULL,
  descricao       TEXT,
  categoria       VARCHAR(60),
  quantidade      NUMERIC(10,3) NOT NULL DEFAULT 0,
  quantidade_min  NUMERIC(10,3) NOT NULL DEFAULT 0,
  unidade         VARCHAR(20)   DEFAULT 'unidade',   -- unidade | ml | g | litro
  custo_unitario  NUMERIC(10,2) DEFAULT 0,
  codigo_barras   VARCHAR(50),
  fornecedor      VARCHAR(120),
  ativo           BOOLEAN       DEFAULT TRUE,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estoque_barbearia ON estoque(barbearia_id);

-- Histórico de movimentações do estoque
CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID          NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  estoque_id      UUID          NOT NULL REFERENCES estoque(id)    ON DELETE CASCADE,
  tipo            VARCHAR(10)   NOT NULL,  -- entrada | saida | ajuste
  quantidade      NUMERIC(10,3) NOT NULL,
  motivo          TEXT,
  criado_por      UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ─── NOTIFICACOES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificacoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID         NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  agendamento_id  UUID         REFERENCES agendamentos(id) ON DELETE SET NULL,
  tipo            VARCHAR(30)  NOT NULL,
    -- lembrete_2h | lembrete_24h | novo_agendamento | cancelamento | pagamento
  titulo          VARCHAR(200) NOT NULL,
  mensagem        TEXT         NOT NULL,
  canal           VARCHAR(20)  DEFAULT 'sistema',  -- sistema | whatsapp | email | sms
  destinatario    VARCHAR(20)  NOT NULL,            -- cliente | barbeiro | admin
  lida            BOOLEAN      DEFAULT FALSE,
  enviado         BOOLEAN      DEFAULT FALSE,
  enviado_em      TIMESTAMPTZ,
  erro_envio      TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_barbearia  ON notificacoes(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_notif_usuario    ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notif_lida       ON notificacoes(lida);

-- ─── PAGAMENTOS (histórico) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS pagamentos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id        UUID          NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  assinatura_id       UUID          REFERENCES assinaturas(id) ON DELETE SET NULL,
  gateway             VARCHAR(20)   NOT NULL,  -- stripe | mercadopago
  gateway_payment_id  VARCHAR(200)  UNIQUE,
  gateway_event_id    VARCHAR(200),
  valor               NUMERIC(10,2) NOT NULL,
  moeda               CHAR(3)       DEFAULT 'BRL',
  status              VARCHAR(20)   NOT NULL,  -- pending | approved | rejected | refunded
  descricao           TEXT,
  payload_raw         JSONB,
  created_at          TIMESTAMPTZ   DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pgto_barbearia ON pagamentos(barbearia_id);

-- ─── TRIGGERS: updated_at automático ─────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'barbearias','assinaturas','usuarios','barbeiros',
    'clientes','servicos','agendamentos','financeiro',
    'estoque','pagamentos'
  ]
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER set_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      t
    );
  END LOOP;
END;
$$;

-- ─── VIEW: Resumo financeiro mensal ──────────────────────────
CREATE OR REPLACE VIEW vw_resumo_financeiro AS
SELECT
  barbearia_id,
  DATE_TRUNC('month', data)            AS mes,
  SUM(CASE WHEN tipo='receita' THEN valor ELSE 0 END) AS total_receitas,
  SUM(CASE WHEN tipo='despesa' THEN valor ELSE 0 END) AS total_despesas,
  SUM(CASE WHEN tipo='receita' THEN valor ELSE -valor END) AS lucro_liquido,
  COUNT(*)                             AS total_lancamentos
FROM financeiro
GROUP BY barbearia_id, DATE_TRUNC('month', data);

-- ─── VIEW: Agendamentos hoje ──────────────────────────────────
CREATE OR REPLACE VIEW vw_agendamentos_hoje AS
SELECT
  a.*,
  c.nome  AS cliente_nome,
  c.whatsapp AS cliente_whatsapp,
  b.nome  AS barbeiro_nome,
  s.nome  AS servico_nome,
  s.duracao_min
FROM agendamentos a
JOIN clientes  c ON c.id = a.cliente_id
JOIN barbeiros b ON b.id = a.barbeiro_id
JOIN servicos  s ON s.id = a.servico_id
WHERE DATE(a.data_hora AT TIME ZONE 'America/Manaus') = CURRENT_DATE
  AND a.status NOT IN ('cancelado','no_show');

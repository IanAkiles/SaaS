-- ============================================================
-- BarberPro SaaS — Migration Completa
-- Execute: psql -U postgres -d barberpro -f migrations/001_init.sql
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE plano_tipo AS ENUM ('trial', 'mensal', 'anual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE assinatura_status AS ENUM ('trial', 'ativo', 'vencido', 'bloqueado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agendamento_status AS ENUM ('agendado', 'confirmado', 'concluido', 'cancelado', 'falta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transacao_tipo AS ENUM ('receita', 'despesa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notif_tipo AS ENUM ('agendamento', 'lembrete', 'sistema', 'pagamento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE usuario_role AS ENUM ('owner', 'barbeiro', 'recepcionista');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pagamento_status AS ENUM ('pendente', 'aprovado', 'recusado', 'reembolsado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- BARBEARIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS barbearias (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          VARCHAR(120) NOT NULL,
  slug          VARCHAR(80) UNIQUE NOT NULL,
  email         VARCHAR(120) UNIQUE NOT NULL,
  telefone      VARCHAR(20),
  endereco      TEXT,
  cidade        VARCHAR(80),
  estado        VARCHAR(2),
  cep           VARCHAR(10),
  logo_url      TEXT,
  cor_primaria  VARCHAR(7) DEFAULT '#C9A84C',
  timezone      VARCHAR(50) DEFAULT 'America/Manaus',
  ativo         BOOLEAN DEFAULT TRUE,
  criado_em     TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ASSINATURAS
-- ============================================================
CREATE TABLE IF NOT EXISTS assinaturas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id      UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  plano             plano_tipo NOT NULL DEFAULT 'trial',
  status            assinatura_status NOT NULL DEFAULT 'trial',
  data_inicio       DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento   DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  stripe_customer_id     VARCHAR(120),
  stripe_subscription_id VARCHAR(120),
  stripe_price_id        VARCHAR(120),
  ultimo_pagamento  TIMESTAMPTZ,
  proximo_pagamento DATE,
  valor_mensal      DECIMAL(10,2) DEFAULT 0,
  cancelado_em      TIMESTAMPTZ,
  motivo_cancelamento TEXT,
  criado_em         TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(barbearia_id)
);

-- ============================================================
-- USUARIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome            VARCHAR(120) NOT NULL,
  email           VARCHAR(120) NOT NULL,
  senha_hash      TEXT NOT NULL,
  role            usuario_role NOT NULL DEFAULT 'barbeiro',
  telefone        VARCHAR(20),
  foto_url        TEXT,
  ativo           BOOLEAN DEFAULT TRUE,
  email_verificado BOOLEAN DEFAULT FALSE,
  token_verificacao TEXT,
  token_reset_senha TEXT,
  token_reset_expira TIMESTAMPTZ,
  ultimo_login    TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, barbearia_id)
);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  expira_em     TIMESTAMPTZ NOT NULL,
  revogado      BOOLEAN DEFAULT FALSE,
  ip            VARCHAR(45),
  user_agent    TEXT,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BARBEIROS
-- ============================================================
CREATE TABLE IF NOT EXISTS barbeiros (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id  UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  usuario_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  nome          VARCHAR(120) NOT NULL,
  apelido       VARCHAR(60),
  telefone      VARCHAR(20),
  foto_url      TEXT,
  comissao_pct  DECIMAL(5,2) DEFAULT 0.00,
  especialidades TEXT[],
  horario_inicio TIME DEFAULT '08:00',
  horario_fim    TIME DEFAULT '18:00',
  dias_trabalho  INT[] DEFAULT '{1,2,3,4,5,6}',
  ativo          BOOLEAN DEFAULT TRUE,
  criado_em     TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id  UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome          VARCHAR(120) NOT NULL,
  email         VARCHAR(120),
  telefone      VARCHAR(20),
  whatsapp      VARCHAR(20),
  data_nascimento DATE,
  genero        VARCHAR(20),
  endereco      TEXT,
  observacoes   TEXT,
  total_visitas INT DEFAULT 0,
  ultima_visita DATE,
  ticket_medio  DECIMAL(10,2) DEFAULT 0,
  total_gasto   DECIMAL(10,2) DEFAULT 0,
  bloqueado     BOOLEAN DEFAULT FALSE,
  criado_em     TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SERVIÇOS
-- ============================================================
CREATE TABLE IF NOT EXISTS servicos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id  UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome          VARCHAR(120) NOT NULL,
  descricao     TEXT,
  preco         DECIMAL(10,2) NOT NULL,
  duracao_min   INT NOT NULL DEFAULT 30,
  comissao_pct  DECIMAL(5,2) DEFAULT 0,
  categoria     VARCHAR(60),
  ativo         BOOLEAN DEFAULT TRUE,
  criado_em     TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AGENDAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS agendamentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  barbeiro_id     UUID NOT NULL REFERENCES barbeiros(id) ON DELETE RESTRICT,
  servico_id      UUID NOT NULL REFERENCES servicos(id) ON DELETE RESTRICT,
  data            DATE NOT NULL,
  hora_inicio     TIME NOT NULL,
  hora_fim        TIME NOT NULL,
  status          agendamento_status NOT NULL DEFAULT 'agendado',
  valor           DECIMAL(10,2) NOT NULL,
  desconto        DECIMAL(10,2) DEFAULT 0,
  valor_final     DECIMAL(10,2) NOT NULL,
  observacoes     TEXT,
  lembrete_1h_enviado  BOOLEAN DEFAULT FALSE,
  lembrete_2h_enviado  BOOLEAN DEFAULT FALSE,
  notif_confirmacao_enviada BOOLEAN DEFAULT FALSE,
  origem          VARCHAR(30) DEFAULT 'sistema',
  cancelado_por   VARCHAR(30),
  motivo_cancelamento TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FINANCEIRO (lançamentos)
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  agendamento_id  UUID REFERENCES agendamentos(id) ON DELETE SET NULL,
  tipo            transacao_tipo NOT NULL,
  categoria       VARCHAR(80),
  descricao       TEXT NOT NULL,
  valor           DECIMAL(10,2) NOT NULL,
  data            DATE NOT NULL,
  forma_pagamento VARCHAR(40) DEFAULT 'dinheiro',
  comprovante_url TEXT,
  observacoes     TEXT,
  criado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ESTOQUE
-- ============================================================
CREATE TABLE IF NOT EXISTS estoque (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome            VARCHAR(120) NOT NULL,
  categoria       VARCHAR(60),
  descricao       TEXT,
  quantidade      DECIMAL(10,3) NOT NULL DEFAULT 0,
  quantidade_min  DECIMAL(10,3) NOT NULL DEFAULT 0,
  unidade         VARCHAR(20) DEFAULT 'un',
  custo_unitario  DECIMAL(10,2) DEFAULT 0,
  preco_venda     DECIMAL(10,2) DEFAULT 0,
  codigo_barras   VARCHAR(60),
  fornecedor      VARCHAR(120),
  ativo           BOOLEAN DEFAULT TRUE,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Movimentações de estoque
CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  produto_id      UUID NOT NULL REFERENCES estoque(id) ON DELETE CASCADE,
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada','saida','ajuste')),
  quantidade      DECIMAL(10,3) NOT NULL,
  custo_unitario  DECIMAL(10,2),
  motivo          TEXT,
  agendamento_id  UUID REFERENCES agendamentos(id) ON DELETE SET NULL,
  criado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICAÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS notificacoes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id    UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  agendamento_id  UUID REFERENCES agendamentos(id) ON DELETE CASCADE,
  tipo            notif_tipo NOT NULL,
  titulo          VARCHAR(200) NOT NULL,
  mensagem        TEXT NOT NULL,
  destinatario    VARCHAR(30) NOT NULL CHECK (destinatario IN ('cliente','barbeiro','owner','all')),
  usuario_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  canal           VARCHAR(20) DEFAULT 'sistema' CHECK (canal IN ('sistema','email','whatsapp','sms')),
  enviado         BOOLEAN DEFAULT FALSE,
  enviado_em      TIMESTAMPTZ,
  lido            BOOLEAN DEFAULT FALSE,
  lido_em         TIMESTAMPTZ,
  erro_envio      TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAGAMENTOS (histórico Stripe/MP)
-- ============================================================
CREATE TABLE IF NOT EXISTS pagamentos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbearia_id      UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  assinatura_id     UUID REFERENCES assinaturas(id) ON DELETE SET NULL,
  gateway           VARCHAR(30) NOT NULL CHECK (gateway IN ('stripe','mercadopago','manual')),
  gateway_payment_id VARCHAR(200),
  gateway_invoice_id VARCHAR(200),
  status            pagamento_status NOT NULL DEFAULT 'pendente',
  valor             DECIMAL(10,2) NOT NULL,
  moeda             VARCHAR(3) DEFAULT 'BRL',
  descricao         TEXT,
  periodo_inicio    DATE,
  periodo_fim       DATE,
  metadata          JSONB DEFAULT '{}',
  criado_em         TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_barbearia ON usuarios(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_clientes_barbearia ON clientes(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(barbearia_id, telefone);
CREATE INDEX IF NOT EXISTS idx_barbeiros_barbearia ON barbeiros(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_barbearia ON agendamentos(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(barbearia_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro ON agendamentos(barbeiro_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(barbearia_id, status);
CREATE INDEX IF NOT EXISTS idx_financeiro_barbearia ON financeiro(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_data ON financeiro(barbearia_id, data);
CREATE INDEX IF NOT EXISTS idx_estoque_barbearia ON estoque(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_barbearia ON notificacoes(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lido ON notificacoes(barbearia_id, lido);
CREATE INDEX IF NOT EXISTS idx_assinaturas_barbearia ON assinaturas(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_status ON assinaturas(status);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- ============================================================
-- TRIGGERS — atualizado_em automático
-- ============================================================
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'barbearias','assinaturas','usuarios','barbeiros','clientes',
    'servicos','agendamentos','financeiro','estoque','pagamentos'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_update_%1$s ON %1$s;
      CREATE TRIGGER trg_update_%1$s
        BEFORE UPDATE ON %1$s
        FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
    ', t);
  END LOOP;
END $$;

-- ============================================================
-- TRIGGER — atualiza stats do cliente após agendamento
-- ============================================================
CREATE OR REPLACE FUNCTION atualizar_stats_cliente()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'concluido' THEN
    UPDATE clientes SET
      total_visitas = total_visitas + 1,
      ultima_visita = NEW.data,
      total_gasto   = total_gasto + NEW.valor_final,
      ticket_medio  = (total_gasto + NEW.valor_final) / (total_visitas + 1)
    WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stats_cliente ON agendamentos;
CREATE TRIGGER trg_stats_cliente
  AFTER UPDATE ON agendamentos
  FOR EACH ROW
  WHEN (OLD.status != 'concluido' AND NEW.status = 'concluido')
  EXECUTE FUNCTION atualizar_stats_cliente();

-- ============================================================
-- TRIGGER — ajusta quantidade de estoque
-- ============================================================
CREATE OR REPLACE FUNCTION ajustar_estoque()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'entrada' OR NEW.tipo = 'ajuste' THEN
    UPDATE estoque SET quantidade = quantidade + NEW.quantidade WHERE id = NEW.produto_id;
  ELSIF NEW.tipo = 'saida' THEN
    UPDATE estoque SET quantidade = GREATEST(0, quantidade - NEW.quantidade) WHERE id = NEW.produto_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ajustar_estoque ON estoque_movimentos;
CREATE TRIGGER trg_ajustar_estoque
  AFTER INSERT ON estoque_movimentos
  FOR EACH ROW EXECUTE FUNCTION ajustar_estoque();

-- Confirmação
DO $$ BEGIN
  RAISE NOTICE 'Migration concluída com sucesso!';
END $$;

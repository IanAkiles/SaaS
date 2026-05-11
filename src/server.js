require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const { pool }    = require('./config/database');
const { errorHandler, sanitizeInput } = require('./middlewares/validate');
const { iniciarCrons } = require('./services/cronService');
const logger      = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

/* ─── SEGURANÇA ─────────────────────────────────────────────── */
app.use(helmet());
app.set('trust proxy', 1);

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    /\.vercel\.app$/,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limit geral
app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      Number(process.env.RATE_LIMIT_MAX)        || 100,
  message:  { success: false, message: 'Muitas requisições. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
}));

// Rate limit restrito para auth
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { success: false, message: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});

/* ─── WEBHOOK STRIPE (raw body ANTES do json parser) ────────── */
app.use('/api/pagamentos/stripe/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/pagamentos')
);

/* ─── BODY PARSERS ──────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);

/* ─── HEALTH CHECK ──────────────────────────────────────────── */
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({
      success: true,
      message: 'BarberPro API online',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV,
    });
  } catch {
    return res.status(503).json({ success: false, message: 'Database offline' });
  }
});

/* ─── ROTAS ─────────────────────────────────────────────────── */
app.use('/api/auth',         authLimit, require('./routes/auth'));
app.use('/api/agendamentos', require('./routes/agendamentos'));
app.use('/api/clientes',     require('./routes/clientes'));
app.use('/api/barbeiros',    require('./routes/barbeiros'));
app.use('/api/servicos',     require('./routes/servicos'));
app.use('/api/estoque',      require('./routes/estoque'));
app.use('/api/financeiro',   require('./routes/financeiro'));
app.use('/api/notificacoes', require('./routes/notificacoes'));
app.use('/api/assinatura',   require('./routes/assinatura'));
app.use('/api/pagamentos',   require('./routes/pagamentos'));

/* ─── 404 ───────────────────────────────────────────────────── */
app.use('*', (_req, res) =>
  res.status(404).json({ success: false, message: 'Rota não encontrada' })
);

/* ─── ERROR HANDLER ─────────────────────────────────────────── */
app.use(errorHandler);

/* ─── START ─────────────────────────────────────────────────── */
const startServer = async () => {
  try {
    await pool.query('SELECT 1');
    logger.info('[DB] Conexão com PostgreSQL estabelecida');

    app.listen(PORT, () => {
      logger.info(`[SERVER] BarberPro API rodando na porta ${PORT} (${process.env.NODE_ENV})`);
      logger.info(`[SERVER] Health: http://localhost:${PORT}/health`);
    });

    // Inicia cron jobs (lembretes 2h, verificação de assinaturas)
    iniciarCrons();

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`[SERVER] ${signal} recebido. Encerrando...`);
      await pool.end();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    logger.error(`[SERVER] Falha ao iniciar: ${err.message}`);
    process.exit(1);
  }
};

startServer();

module.exports = app; // Para testes

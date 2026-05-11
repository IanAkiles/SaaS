const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB] Nova conexão estabelecida');
  }
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message);
});

/**
 * Executa uma query com parâmetros
 * @param {string} text - SQL
 * @param {Array}  params - Parâmetros
 */
const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('[DB] query', { text: text.slice(0, 80), duration, rows: res.rowCount });
  }
  return res;
};

/**
 * Obtém um client do pool (para transações)
 */
const getClient = () => pool.connect();

/**
 * Helper para transações
 * @param {Function} fn - Função assíncrona que recebe o client
 */
const transaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, getClient, transaction };

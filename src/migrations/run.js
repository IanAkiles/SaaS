require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Tabela de controle de migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL UNIQUE,
        executado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT id FROM migrations WHERE nome = $1', [file]
      );
      if (rows.length > 0) {
        logger.info(`Migration já executada: ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      logger.info(`Executando migration: ${file}`);
      await client.query(sql);
      await client.query('INSERT INTO migrations (nome) VALUES ($1)', [file]);
      logger.info(`Migration concluída: ${file}`);
    }

    logger.info('Todas as migrations foram executadas com sucesso!');
  } catch (err) {
    logger.error('Erro ao executar migrations:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();

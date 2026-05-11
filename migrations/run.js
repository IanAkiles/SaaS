require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('[MIGRATE] Conectando ao banco...');
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log('[MIGRATE] ✅ Schema aplicado com sucesso!');
  } catch (err) {
    console.error('[MIGRATE] ❌ Erro:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();

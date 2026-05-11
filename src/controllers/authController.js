const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, transaction } = require('../config/database');
const { generateTokens, verifyRefresh } = require('../utils/jwt');
const { sendResetPassword } = require('../services/emailService');
const R = require('../utils/response');
const logger = require('../utils/logger');

/* ─── REGISTER ───────────────────────────────────────────────── */
const register = async (req, res, next) => {
  try {
    const { nome_barbearia, nome, email, senha, telefone, cidade, estado } = req.body;

    const { rows: exists } = await query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (exists.length) return R.conflict(res, 'E-mail já cadastrado');

    const slug = nome_barbearia
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').slice(0, 80);

    const senhaHash = await bcrypt.hash(senha, 12);

    const result = await transaction(async (client) => {
      const { rows: [barbearia] } = await client.query(
        `INSERT INTO barbearias (nome, slug, email, telefone, cidade, estado)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, slug`,
        [nome_barbearia, slug, email, telefone, cidade, estado]
      );
      await client.query(
        `INSERT INTO assinaturas (barbearia_id, plano, status, data_vencimento)
         VALUES ($1,'basico','trial', NOW() + INTERVAL '7 days')`,
        [barbearia.id]
      );
      const { rows: [usuario] } = await client.query(
        `INSERT INTO usuarios (barbearia_id, nome, email, senha_hash, role)
         VALUES ($1,$2,$3,$4,'dono') RETURNING id,nome,email,role,barbearia_id`,
        [barbearia.id, nome, email, senhaHash]
      );
      return { barbearia, usuario };
    });

    const tokens = generateTokens(result.usuario);
    await query('UPDATE usuarios SET refresh_token=$1 WHERE id=$2', [tokens.refreshToken, result.usuario.id]);
    logger.info(`[AUTH] Register: ${email}`);
    return R.created(res, { usuario: result.usuario, barbearia: result.barbearia, ...tokens }, 'Conta criada! Trial de 7 dias ativo.');
  } catch (err) { next(err); }
};

/* ─── LOGIN ──────────────────────────────────────────────────── */
const login = async (req, res, next) => {
  try {
    const { email, senha } = req.body;
    const { rows } = await query(
      `SELECT u.id,u.nome,u.email,u.senha_hash,u.role,u.ativo,u.barbearia_id,
              b.nome AS barbearia_nome, b.slug AS barbearia_slug,
              a.status AS assinatura_status, a.plano, a.data_vencimento
       FROM usuarios u
       LEFT JOIN barbearias b  ON b.id = u.barbearia_id
       LEFT JOIN assinaturas a ON a.barbearia_id = u.barbearia_id
       WHERE u.email = $1 ORDER BY a.created_at DESC LIMIT 1`,
      [email]
    );
    if (!rows.length)     return R.unauth(res, 'Credenciais inválidas');
    if (!rows[0].ativo)   return R.forbidden(res, 'Conta desativada');
    if (!await bcrypt.compare(senha, rows[0].senha_hash)) return R.unauth(res, 'Credenciais inválidas');

    const user = rows[0];
    const tokens = generateTokens(user);
    await query('UPDATE usuarios SET ultimo_login=NOW(), refresh_token=$1 WHERE id=$2', [tokens.refreshToken, user.id]);
    logger.info(`[AUTH] Login: ${email}`);

    const { senha_hash: _, ...userClean } = user;
    return R.ok(res, { usuario: userClean, ...tokens }, 'Login realizado');
  } catch (err) { next(err); }
};

/* ─── REFRESH ────────────────────────────────────────────────── */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return R.unauth(res, 'Refresh token não fornecido');
    const payload = verifyRefresh(refreshToken);
    const { rows } = await query(
      'SELECT id,nome,email,role,barbearia_id,ativo,refresh_token FROM usuarios WHERE id=$1',
      [payload.id]
    );
    if (!rows.length || rows[0].refresh_token !== refreshToken) return R.unauth(res, 'Refresh token inválido');
    if (!rows[0].ativo) return R.forbidden(res, 'Conta desativada');
    const tokens = generateTokens(rows[0]);
    await query('UPDATE usuarios SET refresh_token=$1 WHERE id=$2', [tokens.refreshToken, rows[0].id]);
    return R.ok(res, tokens, 'Tokens renovados');
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return R.unauth(res, 'Refresh token inválido');
    next(err);
  }
};

/* ─── ME ─────────────────────────────────────────────────────── */
const me = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id,u.nome,u.email,u.role,u.barbearia_id,u.telefone,u.avatar_url,
              b.nome AS barbearia_nome, b.slug, b.logo_url, b.cor_primaria,
              a.status AS assinatura_status, a.plano, a.data_vencimento
       FROM usuarios u
       LEFT JOIN barbearias b  ON b.id = u.barbearia_id
       LEFT JOIN assinaturas a ON a.barbearia_id = u.barbearia_id
       WHERE u.id=$1 ORDER BY a.created_at DESC LIMIT 1`,
      [req.user.id]
    );
    return R.ok(res, rows[0]);
  } catch (err) { next(err); }
};

/* ─── FORGOT PASSWORD ────────────────────────────────────────── */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const { rows } = await query('SELECT id,nome FROM usuarios WHERE email=$1', [email]);
    if (!rows.length) return R.ok(res, {}, 'Se o e-mail existir, você receberá as instruções.');
    const token = crypto.randomBytes(32).toString('hex');
    await query(
      'UPDATE usuarios SET reset_token=$1, reset_token_expiry=NOW()+INTERVAL\'1 hour\' WHERE id=$2',
      [token, rows[0].id]
    );
    await sendResetPassword(email, rows[0].nome, token, process.env.FRONTEND_URL);
    return R.ok(res, {}, 'Se o e-mail existir, você receberá as instruções.');
  } catch (err) { next(err); }
};

/* ─── RESET PASSWORD ─────────────────────────────────────────── */
const resetPassword = async (req, res, next) => {
  try {
    const { token, nova_senha } = req.body;
    const { rows } = await query(
      'SELECT id FROM usuarios WHERE reset_token=$1 AND reset_token_expiry>NOW()', [token]
    );
    if (!rows.length) return R.badRequest(res, 'Token inválido ou expirado');
    const hash = await bcrypt.hash(nova_senha, 12);
    await query('UPDATE usuarios SET senha_hash=$1,reset_token=NULL,reset_token_expiry=NULL WHERE id=$2', [hash, rows[0].id]);
    return R.ok(res, {}, 'Senha redefinida com sucesso');
  } catch (err) { next(err); }
};

/* ─── LOGOUT ─────────────────────────────────────────────────── */
const logout = async (req, res, next) => {
  try {
    await query('UPDATE usuarios SET refresh_token=NULL WHERE id=$1', [req.user.id]);
    return R.ok(res, {}, 'Logout realizado');
  } catch (err) { next(err); }
};

module.exports = { register, login, refresh, me, forgotPassword, resetPassword, logout };

const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN        || '7d';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

/**
 * Gera access token (curta duração)
 */
const signAccess = (payload) =>
  jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXP });

/**
 * Gera refresh token (longa duração)
 */
const signRefresh = (payload) =>
  jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXP });

/**
 * Verifica access token — retorna payload ou lança erro
 */
const verifyAccess = (token) => jwt.verify(token, ACCESS_SECRET);

/**
 * Verifica refresh token
 */
const verifyRefresh = (token) => jwt.verify(token, REFRESH_SECRET);

/**
 * Cria par de tokens (access + refresh)
 */
const generateTokens = (user) => {
  const payload = {
    id:           user.id,
    email:        user.email,
    role:         user.role,
    barbeariaId:  user.barbearia_id,
  };
  return {
    accessToken:  signAccess(payload),
    refreshToken: signRefresh({ id: user.id }),
  };
};

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, generateTokens };

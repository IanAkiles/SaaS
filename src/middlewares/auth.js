const { verifyAccess } = require('../utils/jwt');
const { unauth, forbidden } = require('../utils/response');
const { query } = require('../config/database');

/**
 * Verifica JWT e injeta req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return unauth(res, 'Token não fornecido');
    }

    const token = header.slice(7);
    const payload = verifyAccess(token);

    // Busca usuário atualizado no banco
    const { rows } = await query(
      `SELECT u.id, u.nome, u.email, u.role, u.ativo, u.barbearia_id,
              a.status AS assinatura_status, a.data_vencimento
       FROM usuarios u
       LEFT JOIN assinaturas a ON a.barbearia_id = u.barbearia_id
       WHERE u.id = $1
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [payload.id]
    );

    if (!rows.length || !rows[0].ativo) {
      return unauth(res, 'Usuário não encontrado ou inativo');
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauth(res, 'Token expirado');
    if (err.name === 'JsonWebTokenError')  return unauth(res, 'Token inválido');
    next(err);
  }
};

/**
 * Verifica se assinatura está ativa
 */
const checkAssinatura = (req, res, next) => {
  const { assinatura_status, data_vencimento } = req.user;
  const vencido = data_vencimento && new Date(data_vencimento) < new Date();

  if (assinatura_status === 'bloqueado') {
    return forbidden(res, 'Assinatura bloqueada. Regularize seu plano.');
  }
  if (assinatura_status === 'cancelado') {
    return forbidden(res, 'Assinatura cancelada.');
  }
  if ((assinatura_status === 'vencido' || vencido) && assinatura_status !== 'ativo') {
    return res.status(402).json({
      success: false,
      code: 'SUBSCRIPTION_EXPIRED',
      message: 'Assinatura vencida. Renove para continuar.',
      data_vencimento,
    });
  }
  next();
};

/**
 * Factory: restringe por role
 * Uso: authorize('dono', 'gerente')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return forbidden(res, 'Permissão insuficiente para esta ação');
  }
  next();
};

/**
 * Garante que barbearia_id da query/param é do próprio usuário
 */
const ownBarbearia = (req, res, next) => {
  const id = req.params.barbeariaId || req.query.barbearia_id || req.body.barbearia_id;
  if (id && id !== req.user.barbearia_id) {
    return forbidden(res, 'Acesso negado a dados de outra barbearia');
  }
  next();
};

module.exports = { authenticate, checkAssinatura, authorize, ownBarbearia };

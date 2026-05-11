const Joi  = require('joi');
const xss  = require('xss');
const { badRequest } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Sanitiza strings recursivamente contra XSS
 */
const sanitize = (obj) => {
  if (typeof obj === 'string') return xss(obj.trim());
  if (Array.isArray(obj))     return obj.map(sanitize);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, sanitize(v)])
    );
  }
  return obj;
};

/**
 * Middleware de sanitização de body/query/params
 */
const sanitizeInput = (req, _res, next) => {
  req.body   = sanitize(req.body);
  req.query  = sanitize(req.query);
  req.params = sanitize(req.params);
  next();
};

/**
 * Factory: valida body com schema Joi
 * Uso: validate(schema)
 */
const validate = (schema, target = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[target], {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    const errors = error.details.map((d) => ({
      field:   d.path.join('.'),
      message: d.message.replace(/['"]/g, ''),
    }));
    return badRequest(res, 'Dados inválidos', errors);
  }
  req[target] = value;
  next();
};

/**
 * Handler global de erros (Express error middleware)
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  logger.error('[ERROR]', { message: err.message, stack: err.stack, url: req.originalUrl });

  // Erros do PostgreSQL
  if (err.code === '23505') {
    return badRequest(res, 'Registro já existe (duplicado)', null, 409);
  }
  if (err.code === '23503') {
    return badRequest(res, 'Referência inválida (chave estrangeira)');
  }

  return res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : err.message,
  });
};

module.exports = { sanitizeInput, validate, errorHandler };

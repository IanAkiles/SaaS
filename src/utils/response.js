/**
 * Envia resposta de sucesso padronizada
 */
const ok = (res, data = {}, message = 'OK', status = 200) =>
  res.status(status).json({ success: true, message, data });

/**
 * Envia resposta de erro padronizada
 */
const fail = (res, message = 'Erro interno', status = 500, errors = null) =>
  res.status(status).json({ success: false, message, ...(errors && { errors }) });

/**
 * Atalhos semânticos
 */
const created   = (res, data, msg = 'Criado com sucesso')       => ok(res, data, msg, 201);
const notFound  = (res, msg = 'Recurso não encontrado')          => fail(res, msg, 404);
const forbidden = (res, msg = 'Acesso negado')                   => fail(res, msg, 403);
const badRequest= (res, msg = 'Dados inválidos', errors = null)  => fail(res, msg, 400, errors);
const unauth    = (res, msg = 'Não autenticado')                  => fail(res, msg, 401);
const conflict  = (res, msg = 'Conflito de dados')               => fail(res, msg, 409);

module.exports = { ok, fail, created, notFound, forbidden, badRequest, unauth, conflict };

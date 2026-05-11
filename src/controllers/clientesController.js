const { query } = require('../config/database');
const R = require('../utils/response');

/* ─── LISTAR ─────────────────────────────────────────────────── */
const listar = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { busca = '', page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const like = `%${busca}%`;

    const { rows } = await query(
      `SELECT c.*,
              COUNT(a.id) FILTER (WHERE a.status='concluido') AS total_concluidos
       FROM clientes c
       LEFT JOIN agendamentos a ON a.cliente_id = c.id
       WHERE c.barbearia_id = $1
         AND c.ativo = TRUE
         AND ($2 = '' OR c.nome ILIKE $2 OR c.telefone ILIKE $2 OR c.email ILIKE $2)
       GROUP BY c.id
       ORDER BY c.nome
       LIMIT $3 OFFSET $4`,
      [barbearia_id, like, limit, offset]
    );

    const { rows: [total] } = await query(
      `SELECT COUNT(*) FROM clientes WHERE barbearia_id=$1 AND ativo=TRUE
       AND ($2='' OR nome ILIKE $2 OR telefone ILIKE $2 OR email ILIKE $2)`,
      [barbearia_id, like]
    );

    return R.ok(res, { clientes: rows, total: Number(total.count), page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
};

/* ─── BUSCAR UM ───────────────────────────────────────────────── */
const buscar = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { id } = req.params;

    const { rows } = await query(
      `SELECT c.*,
              json_agg(json_build_object(
                'id',a.id,'data_hora',a.data_hora,'servico',s.nome,
                'barbeiro',b.nome,'valor',a.valor,'status',a.status
              ) ORDER BY a.data_hora DESC) FILTER (WHERE a.id IS NOT NULL) AS historico
       FROM clientes c
       LEFT JOIN agendamentos a ON a.cliente_id = c.id
       LEFT JOIN servicos     s ON s.id = a.servico_id
       LEFT JOIN barbeiros    b ON b.id = a.barbeiro_id
       WHERE c.id = $1 AND c.barbearia_id = $2
       GROUP BY c.id`,
      [id, barbearia_id]
    );

    if (!rows.length) return R.notFound(res, 'Cliente não encontrado');
    return R.ok(res, rows[0]);
  } catch (err) { next(err); }
};

/* ─── CRIAR ──────────────────────────────────────────────────── */
const criar = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { nome, email, telefone, whatsapp, data_nascimento, observacoes } = req.body;

    const { rows } = await query(
      `INSERT INTO clientes
         (barbearia_id, nome, email, telefone, whatsapp, data_nascimento, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [barbearia_id, nome, email || null, telefone || null,
       whatsapp || telefone || null, data_nascimento || null, observacoes || null]
    );

    return R.created(res, rows[0], 'Cliente cadastrado com sucesso');
  } catch (err) { next(err); }
};

/* ─── ATUALIZAR ──────────────────────────────────────────────── */
const atualizar = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { id } = req.params;
    const { nome, email, telefone, whatsapp, data_nascimento, observacoes } = req.body;

    const { rows } = await query(
      `UPDATE clientes SET
         nome=$1, email=$2, telefone=$3, whatsapp=$4,
         data_nascimento=$5, observacoes=$6
       WHERE id=$7 AND barbearia_id=$8
       RETURNING *`,
      [nome, email || null, telefone || null, whatsapp || null,
       data_nascimento || null, observacoes || null, id, barbearia_id]
    );

    if (!rows.length) return R.notFound(res, 'Cliente não encontrado');
    return R.ok(res, rows[0], 'Cliente atualizado');
  } catch (err) { next(err); }
};

/* ─── REMOVER (soft delete) ───────────────────────────────────── */
const remover = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { id } = req.params;

    const { rowCount } = await query(
      'UPDATE clientes SET ativo=FALSE WHERE id=$1 AND barbearia_id=$2',
      [id, barbearia_id]
    );

    if (!rowCount) return R.notFound(res, 'Cliente não encontrado');
    return R.ok(res, {}, 'Cliente removido');
  } catch (err) { next(err); }
};

module.exports = { listar, buscar, criar, atualizar, remover };

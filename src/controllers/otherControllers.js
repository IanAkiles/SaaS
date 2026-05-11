// ═══════════════════════════════════════════════════════
//  barbeirosController.js
// ═══════════════════════════════════════════════════════
const { query } = require('../config/database');
const R = require('../utils/response');

const listarBarbeiros = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*, COUNT(a.id) AS total_agendamentos
       FROM barbeiros b
       LEFT JOIN agendamentos a ON a.barbeiro_id = b.id AND a.status = 'concluido'
       WHERE b.barbearia_id=$1 AND b.ativo=TRUE
       GROUP BY b.id ORDER BY b.nome`,
      [req.user.barbearia_id]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
};

const buscarBarbeiro = async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM barbeiros WHERE id=$1 AND barbearia_id=$2',
      [req.params.id, req.user.barbearia_id]
    );
    if (!rows.length) return R.notFound(res, 'Barbeiro não encontrado');
    return R.ok(res, rows[0]);
  } catch (err) { next(err); }
};

const criarBarbeiro = async (req, res, next) => {
  try {
    const { nome, email, telefone, comissao_pct, especialidades } = req.body;
    const { rows: [b] } = await query(
      `INSERT INTO barbeiros (barbearia_id,nome,email,telefone,comissao_pct,especialidades)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.barbearia_id, nome, email||null, telefone||null, comissao_pct||0, especialidades||[]]
    );
    return R.created(res, b, 'Barbeiro cadastrado');
  } catch (err) { next(err); }
};

const atualizarBarbeiro = async (req, res, next) => {
  try {
    const { nome, email, telefone, comissao_pct, especialidades, ativo } = req.body;
    const { rows: [b] } = await query(
      `UPDATE barbeiros SET nome=$1,email=$2,telefone=$3,comissao_pct=$4,especialidades=$5,ativo=$6
       WHERE id=$7 AND barbearia_id=$8 RETURNING *`,
      [nome, email||null, telefone||null, comissao_pct||0, especialidades||[], ativo!==false, req.params.id, req.user.barbearia_id]
    );
    if (!b) return R.notFound(res, 'Barbeiro não encontrado');
    return R.ok(res, b, 'Barbeiro atualizado');
  } catch (err) { next(err); }
};

const removerBarbeiro = async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'UPDATE barbeiros SET ativo=FALSE WHERE id=$1 AND barbearia_id=$2',
      [req.params.id, req.user.barbearia_id]
    );
    if (!rowCount) return R.notFound(res, 'Barbeiro não encontrado');
    return R.ok(res, {}, 'Barbeiro removido');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════
//  servicosController.js
// ═══════════════════════════════════════════════════════
const listarServicos = async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM servicos WHERE barbearia_id=$1 AND ativo=TRUE ORDER BY nome',
      [req.user.barbearia_id]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
};

const criarServico = async (req, res, next) => {
  try {
    const { nome, descricao, preco, duracao_min, categoria, icone } = req.body;
    const { rows: [s] } = await query(
      `INSERT INTO servicos (barbearia_id,nome,descricao,preco,duracao_min,categoria,icone)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.barbearia_id, nome, descricao||null, preco, duracao_min, categoria||null, icone||'✂']
    );
    return R.created(res, s, 'Serviço criado');
  } catch (err) { next(err); }
};

const atualizarServico = async (req, res, next) => {
  try {
    const { nome, descricao, preco, duracao_min, categoria, icone, ativo } = req.body;
    const { rows: [s] } = await query(
      `UPDATE servicos SET nome=$1,descricao=$2,preco=$3,duracao_min=$4,categoria=$5,icone=$6,ativo=$7
       WHERE id=$8 AND barbearia_id=$9 RETURNING *`,
      [nome, descricao||null, preco, duracao_min, categoria||null, icone||'✂', ativo!==false, req.params.id, req.user.barbearia_id]
    );
    if (!s) return R.notFound(res, 'Serviço não encontrado');
    return R.ok(res, s, 'Serviço atualizado');
  } catch (err) { next(err); }
};

const removerServico = async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'UPDATE servicos SET ativo=FALSE WHERE id=$1 AND barbearia_id=$2',
      [req.params.id, req.user.barbearia_id]
    );
    if (!rowCount) return R.notFound(res, 'Serviço não encontrado');
    return R.ok(res, {}, 'Serviço removido');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════
//  estoqueController.js
// ═══════════════════════════════════════════════════════
const { transaction } = require('../config/database');

const listarEstoque = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT e.*,
              CASE WHEN e.quantidade <= e.quantidade_min THEN 'critico'
                   WHEN e.quantidade = 0 THEN 'zerado'
                   ELSE 'ok' END AS status_estoque
       FROM estoque e
       WHERE e.barbearia_id=$1 AND e.ativo=TRUE
       ORDER BY e.nome`,
      [req.user.barbearia_id]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
};

const criarEstoque = async (req, res, next) => {
  try {
    const { nome, categoria, quantidade, quantidade_min, custo_unitario, unidade, fornecedor } = req.body;
    const { rows: [e] } = await query(
      `INSERT INTO estoque (barbearia_id,nome,categoria,quantidade,quantidade_min,custo_unitario,unidade,fornecedor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.barbearia_id, nome, categoria||null, quantidade, quantidade_min,
       custo_unitario||0, unidade||'unidade', fornecedor||null]
    );
    return R.created(res, e, 'Produto adicionado ao estoque');
  } catch (err) { next(err); }
};

const ajustarEstoque = async (req, res, next) => {
  try {
    const { tipo, quantidade, motivo } = req.body;
    const { id } = req.params;
    const { barbearia_id } = req.user;

    const result = await transaction(async (client) => {
      const { rows: [est] } = await client.query(
        'SELECT * FROM estoque WHERE id=$1 AND barbearia_id=$2 FOR UPDATE',
        [id, barbearia_id]
      );
      if (!est) return null;

      let novaQtd = Number(est.quantidade);
      if (tipo === 'entrada') novaQtd += Number(quantidade);
      else if (tipo === 'saida') novaQtd = Math.max(0, novaQtd - Number(quantidade));
      else novaQtd = Number(quantidade); // ajuste direto

      const { rows: [updated] } = await client.query(
        'UPDATE estoque SET quantidade=$1 WHERE id=$2 RETURNING *',
        [novaQtd, id]
      );

      await client.query(
        `INSERT INTO estoque_movimentacoes (barbearia_id,estoque_id,tipo,quantidade,motivo,criado_por)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [barbearia_id, id, tipo, quantidade, motivo||null, req.user.id]
      );

      return updated;
    });

    if (!result) return R.notFound(res, 'Produto não encontrado');
    return R.ok(res, result, 'Estoque atualizado');
  } catch (err) { next(err); }
};

const removerEstoque = async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'UPDATE estoque SET ativo=FALSE WHERE id=$1 AND barbearia_id=$2',
      [req.params.id, req.user.barbearia_id]
    );
    if (!rowCount) return R.notFound(res, 'Produto não encontrado');
    return R.ok(res, {}, 'Produto removido');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════
//  financeiroController.js
// ═══════════════════════════════════════════════════════
const listarFinanceiro = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { mes, ano, tipo } = req.query;
    const mesNum = Number(mes) || new Date().getMonth() + 1;
    const anoNum = Number(ano) || new Date().getFullYear();

    let extra = '';
    const params = [barbearia_id, anoNum, mesNum];
    if (tipo) { params.push(tipo); extra = ` AND tipo=$${params.length}`; }

    const { rows } = await query(
      `SELECT * FROM financeiro
       WHERE barbearia_id=$1
         AND EXTRACT(YEAR  FROM data)=$2
         AND EXTRACT(MONTH FROM data)=$3
         ${extra}
       ORDER BY data DESC, created_at DESC`,
      params
    );

    const { rows: [resumo] } = await query(
      `SELECT
         SUM(CASE WHEN tipo='receita' THEN valor ELSE 0 END) AS total_receitas,
         SUM(CASE WHEN tipo='despesa' THEN valor ELSE 0 END) AS total_despesas,
         SUM(CASE WHEN tipo='receita' THEN valor ELSE -valor END) AS lucro_liquido
       FROM financeiro
       WHERE barbearia_id=$1
         AND EXTRACT(YEAR FROM data)=$2 AND EXTRACT(MONTH FROM data)=$3`,
      [barbearia_id, anoNum, mesNum]
    );

    return R.ok(res, { lancamentos: rows, resumo });
  } catch (err) { next(err); }
};

const criarLancamento = async (req, res, next) => {
  try {
    const { tipo, descricao, valor, data, categoria, forma_pagamento } = req.body;
    const { rows: [f] } = await query(
      `INSERT INTO financeiro (barbearia_id,tipo,descricao,valor,data,categoria,forma_pagamento,criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.barbearia_id, tipo, descricao, valor, data, categoria||null,
       forma_pagamento||null, req.user.id]
    );
    return R.created(res, f, 'Lançamento criado');
  } catch (err) { next(err); }
};

const removerLancamento = async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM financeiro WHERE id=$1 AND barbearia_id=$2 AND agendamento_id IS NULL',
      [req.params.id, req.user.barbearia_id]
    );
    if (!rowCount) return R.notFound(res, 'Lançamento não encontrado ou vinculado a agendamento');
    return R.ok(res, {}, 'Lançamento removido');
  } catch (err) { next(err); }
};

const resumoMensal = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM vw_resumo_financeiro WHERE barbearia_id=$1 ORDER BY mes DESC LIMIT 12`,
      [req.user.barbearia_id]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════
//  notificacoesController.js
// ═══════════════════════════════════════════════════════
const listarNotificacoes = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM notificacoes
       WHERE barbearia_id=$1
         AND (usuario_id=$2 OR usuario_id IS NULL)
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.barbearia_id, req.user.id]
    );
    const naoLidas = rows.filter(n => !n.lida).length;
    return R.ok(res, { notificacoes: rows, nao_lidas: naoLidas });
  } catch (err) { next(err); }
};

const marcarLida = async (req, res, next) => {
  try {
    await query(
      'UPDATE notificacoes SET lida=TRUE WHERE id=$1 AND barbearia_id=$2',
      [req.params.id, req.user.barbearia_id]
    );
    return R.ok(res, {}, 'Notificação lida');
  } catch (err) { next(err); }
};

const marcarTodasLidas = async (req, res, next) => {
  try {
    await query(
      'UPDATE notificacoes SET lida=TRUE WHERE barbearia_id=$1',
      [req.user.barbearia_id]
    );
    return R.ok(res, {}, 'Todas marcadas como lidas');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════
//  assinaturaController.js
// ═══════════════════════════════════════════════════════
const buscarAssinatura = async (req, res, next) => {
  try {
    const { rows: [a] } = await query(
      'SELECT * FROM assinaturas WHERE barbearia_id=$1 ORDER BY created_at DESC LIMIT 1',
      [req.user.barbearia_id]
    );
    return R.ok(res, a || null);
  } catch (err) { next(err); }
};

const listarPagamentos = async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM pagamentos WHERE barbearia_id=$1 ORDER BY created_at DESC LIMIT 20',
      [req.user.barbearia_id]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
};

module.exports = {
  // Barbeiros
  listarBarbeiros, buscarBarbeiro, criarBarbeiro, atualizarBarbeiro, removerBarbeiro,
  // Serviços
  listarServicos, criarServico, atualizarServico, removerServico,
  // Estoque
  listarEstoque, criarEstoque, ajustarEstoque, removerEstoque,
  // Financeiro
  listarFinanceiro, criarLancamento, removerLancamento, resumoMensal,
  // Notificações
  listarNotificacoes, marcarLida, marcarTodasLidas,
  // Assinatura
  buscarAssinatura, listarPagamentos,
};

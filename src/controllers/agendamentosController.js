const { query, transaction } = require('../config/database');
const R = require('../utils/response');
const logger = require('../utils/logger');

/* ─── LISTAR ─────────────────────────────────────────────────── */
const listar = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { data, barbeiro_id, status, page = 1, limit = 100 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const params = [barbearia_id];
    let extra = '';
    if (data)       { params.push(data);        extra += ` AND DATE(a.data_hora AT TIME ZONE 'America/Manaus') = $${params.length}::date`; }
    if (barbeiro_id){ params.push(barbeiro_id);  extra += ` AND a.barbeiro_id = $${params.length}`; }
    if (status)     { params.push(status);       extra += ` AND a.status = $${params.length}`; }
    params.push(limit, offset);

    const { rows } = await query(
      `SELECT a.*, c.nome AS cliente_nome, c.whatsapp AS cliente_whatsapp,
              b.nome AS barbeiro_nome, s.nome AS servico_nome, s.icone AS servico_icone, s.duracao_min
       FROM agendamentos a
       JOIN clientes  c ON c.id = a.cliente_id
       JOIN barbeiros b ON b.id = a.barbeiro_id
       JOIN servicos  s ON s.id = a.servico_id
       WHERE a.barbearia_id = $1 ${extra}
       ORDER BY a.data_hora
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return R.ok(res, { agendamentos: rows, total: rows.length });
  } catch (err) { next(err); }
};

/* ─── BUSCAR UM ───────────────────────────────────────────────── */
const buscar = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { rows } = await query(
      `SELECT a.*, c.nome AS cliente_nome, c.whatsapp, c.telefone AS cliente_telefone,
              b.nome AS barbeiro_nome, s.nome AS servico_nome, s.icone, s.preco, s.duracao_min
       FROM agendamentos a
       JOIN clientes  c ON c.id = a.cliente_id
       JOIN barbeiros b ON b.id = a.barbeiro_id
       JOIN servicos  s ON s.id = a.servico_id
       WHERE a.id = $1 AND a.barbearia_id = $2`,
      [req.params.id, barbearia_id]
    );
    if (!rows.length) return R.notFound(res, 'Agendamento não encontrado');
    return R.ok(res, rows[0]);
  } catch (err) { next(err); }
};

/* ─── CRIAR ──────────────────────────────────────────────────── */
const criar = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { cliente_id, barbeiro_id, servico_id, data_hora, observacoes } = req.body;

    const { rows: [svc] } = await query(
      'SELECT duracao_min, preco, nome FROM servicos WHERE id=$1 AND barbearia_id=$2 AND ativo=TRUE',
      [servico_id, barbearia_id]
    );
    if (!svc) return R.notFound(res, 'Serviço não encontrado');

    const dataFim = new Date(new Date(data_hora).getTime() + svc.duracao_min * 60000).toISOString();

    const { rows: conflitos } = await query(
      `SELECT id FROM agendamentos
       WHERE barbeiro_id=$1 AND barbearia_id=$2 AND status NOT IN ('cancelado','no_show')
         AND data_hora < $4::timestamptz
         AND (data_hora + (duracao_min || ' minutes')::interval) > $3::timestamptz`,
      [barbeiro_id, barbearia_id, data_hora, dataFim]
    );
    if (conflitos.length) return R.conflict(res, 'Barbeiro já possui agendamento neste horário');

    const result = await transaction(async (client) => {
      const { rows: [ag] } = await client.query(
        `INSERT INTO agendamentos
           (barbearia_id,cliente_id,barbeiro_id,servico_id,data_hora,duracao_min,valor,observacoes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [barbearia_id, cliente_id, barbeiro_id, servico_id,
         data_hora, svc.duracao_min, svc.preco, observacoes || null]
      );

      await client.query(
        `INSERT INTO financeiro (barbearia_id,agendamento_id,tipo,descricao,valor,data,categoria)
         SELECT $1,$2,'receita', $3 || ' — ' || c.nome, $4, DATE($5::timestamptz), 'Serviços'
         FROM clientes c WHERE c.id=$6`,
        [barbearia_id, ag.id, svc.nome, svc.preco, data_hora, cliente_id]
      );

      await client.query(
        `UPDATE clientes SET total_visitas=total_visitas+1, ultima_visita=DATE($1::timestamptz)
         WHERE id=$2`,
        [data_hora, cliente_id]
      );

      const { rows: [cli] }  = await client.query('SELECT nome FROM clientes  WHERE id=$1', [cliente_id]);
      const { rows: [barb] } = await client.query('SELECT nome FROM barbeiros WHERE id=$1', [barbeiro_id]);
      const dataFmt = new Date(data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

      await client.query(
        `INSERT INTO notificacoes (barbearia_id,agendamento_id,tipo,titulo,mensagem,destinatario)
         VALUES
           ($1,$2,'novo_agendamento','📅 Agendamento confirmado',$3,'cliente'),
           ($1,$2,'novo_agendamento','📅 Novo agendamento',$4,'barbeiro')`,
        [barbearia_id, ag.id,
         `Seu ${svc.nome} foi agendado para ${dataFmt} com o barbeiro ${barb?.nome}. Lembrete 2h antes!`,
         `${cli?.nome} marcou ${svc.nome} para ${dataFmt}.`]
      );

      return ag;
    });

    logger.info(`[AG] Criado ${result.id}`);
    return R.created(res, result, 'Agendamento criado com sucesso');
  } catch (err) { next(err); }
};

/* ─── ATUALIZAR STATUS ───────────────────────────────────────── */
const atualizarStatus = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { id } = req.params;
    const { status, motivo_cancelamento } = req.body;
    const validos = ['agendado','confirmado','em_andamento','concluido','cancelado','no_show'];
    if (!validos.includes(status)) return R.badRequest(res, `Status inválido. Use: ${validos.join(', ')}`);

    const result = await transaction(async (client) => {
      const { rows: [ag] } = await client.query(
        `UPDATE agendamentos SET status=$1, motivo_cancelamento=$2
         WHERE id=$3 AND barbearia_id=$4 RETURNING *`,
        [status, motivo_cancelamento || null, id, barbearia_id]
      );
      if (!ag) return null;
      if (status === 'cancelado') {
        await client.query(
          `UPDATE financeiro SET descricao = '[CANCELADO] ' || descricao WHERE agendamento_id=$1`,
          [id]
        );
        await client.query(
          'UPDATE clientes SET total_visitas=GREATEST(0,total_visitas-1) WHERE id=$1',
          [ag.cliente_id]
        );
      }
      return ag;
    });

    if (!result) return R.notFound(res, 'Agendamento não encontrado');
    return R.ok(res, result, 'Status atualizado');
  } catch (err) { next(err); }
};

/* ─── HORÁRIOS DISPONÍVEIS ───────────────────────────────────── */
const horariosDisponiveis = async (req, res, next) => {
  try {
    const { barbearia_id } = req.user;
    const { barbeiro_id, data, servico_id } = req.query;
    if (!barbeiro_id || !data) return R.badRequest(res, 'barbeiro_id e data são obrigatórios');

    let duracaoMin = 30;
    if (servico_id) {
      const { rows: [svc] } = await query('SELECT duracao_min FROM servicos WHERE id=$1', [servico_id]);
      if (svc) duracaoMin = svc.duracao_min;
    }

    const { rows: ocupados } = await query(
      `SELECT data_hora, duracao_min FROM agendamentos
       WHERE barbeiro_id=$1 AND barbearia_id=$2
         AND DATE(data_hora AT TIME ZONE 'America/Manaus')=$3::date
         AND status NOT IN ('cancelado','no_show')`,
      [barbeiro_id, barbearia_id, data]
    );

    const INICIO = 8 * 60, FIM = 18 * 60;
    const slots = [];
    for (let m = INICIO; m + duracaoMin <= FIM; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      const ini = new Date(`${data}T${hh}:${mm}:00`);
      const fim = new Date(ini.getTime() + duracaoMin * 60000);
      const ocupado = ocupados.some(ag => {
        const agIni = new Date(ag.data_hora);
        const agFim = new Date(agIni.getTime() + ag.duracao_min * 60000);
        return ini < agFim && fim > agIni;
      });
      slots.push({ hora: `${hh}:${mm}`, disponivel: !ocupado });
    }
    return R.ok(res, { data, barbeiro_id, slots });
  } catch (err) { next(err); }
};

module.exports = { listar, buscar, criar, atualizarStatus, horariosDisponiveis };

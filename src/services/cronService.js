const cron = require('node-cron');
const { query } = require('../config/database');
const { sendLembrete, sendAssinaturaVencendo } = require('./emailService');
const logger = require('../utils/logger');

/* ─── LEMBRETES 2H ANTES ────────────────────────────────────── */
const verificarLembretes2h = async () => {
  try {
    const { rows: agendamentos } = await query(
      `SELECT a.id, a.data_hora, a.servico_id, a.barbeiro_id, a.cliente_id, a.barbearia_id,
              c.nome AS cliente_nome, c.email AS cliente_email, c.whatsapp AS cliente_whatsapp,
              b.nome AS barbeiro_nome, b.email AS barbeiro_email,
              s.nome AS servico_nome
       FROM agendamentos a
       JOIN clientes  c ON c.id = a.cliente_id
       JOIN barbeiros b ON b.id = a.barbeiro_id
       JOIN servicos  s ON s.id = a.servico_id
       WHERE a.status IN ('agendado','confirmado')
         AND a.lembrete_2h_enviado = FALSE
         AND a.data_hora BETWEEN NOW() + INTERVAL '1h 50m'
                              AND NOW() + INTERVAL '2h 10m'`,
      []
    );

    for (const ag of agendamentos) {
      try {
        // Insere notificação no banco
        await query(
          `INSERT INTO notificacoes
             (barbearia_id, agendamento_id, tipo, titulo, mensagem, destinatario, canal, enviado, enviado_em)
           VALUES
             ($1,$2,'lembrete_2h','⏰ Lembrete — 2h antes',$3,'cliente','sistema',TRUE,NOW()),
             ($1,$2,'lembrete_2h','⏰ Lembrete — 2h antes',$4,'barbeiro','sistema',TRUE,NOW())`,
          [
            ag.barbearia_id, ag.id,
            `Seu ${ag.servico_nome} é às ${new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} com o barbeiro ${ag.barbeiro_nome}. Te esperamos!`,
            `${ag.cliente_nome} tem ${ag.servico_nome} às ${new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
          ]
        );

        // Envia e-mail se disponível
        if (ag.cliente_email) {
          await sendLembrete(ag.cliente_email, ag.cliente_nome, ag.servico_nome, ag.data_hora, ag.barbeiro_nome);
        }
        if (ag.barbeiro_email) {
          await sendLembrete(ag.barbeiro_email, ag.barbeiro_nome, ag.servico_nome, ag.data_hora, ag.cliente_nome);
        }

        // Marca como enviado
        await query(
          'UPDATE agendamentos SET lembrete_2h_enviado=TRUE WHERE id=$1',
          [ag.id]
        );

        logger.info(`[CRON] Lembrete 2h enviado: agendamento ${ag.id}`);
      } catch (err) {
        logger.error(`[CRON] Falha lembrete ag ${ag.id}: ${err.message}`);
      }
    }

    if (agendamentos.length > 0) {
      logger.info(`[CRON] ${agendamentos.length} lembrete(s) de 2h processado(s)`);
    }
  } catch (err) {
    logger.error(`[CRON] verificarLembretes2h: ${err.message}`);
  }
};

/* ─── LEMBRETES 24H ANTES ───────────────────────────────────── */
const verificarLembretes24h = async () => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.data_hora, a.barbearia_id,
              c.nome AS cliente_nome, c.email AS cliente_email,
              b.nome AS barbeiro_nome,
              s.nome AS servico_nome
       FROM agendamentos a
       JOIN clientes  c ON c.id = a.cliente_id
       JOIN barbeiros b ON b.id = a.barbeiro_id
       JOIN servicos  s ON s.id = a.servico_id
       WHERE a.status IN ('agendado','confirmado')
         AND a.lembrete_24h_enviado = FALSE
         AND a.data_hora BETWEEN NOW() + INTERVAL '23h 50m'
                              AND NOW() + INTERVAL '24h 10m'`,
      []
    );

    for (const ag of rows) {
      await query(
        `INSERT INTO notificacoes (barbearia_id,agendamento_id,tipo,titulo,mensagem,destinatario,canal,enviado,enviado_em)
         VALUES ($1,$2,'lembrete_24h','📅 Lembrete — amanhã',$3,'cliente','sistema',TRUE,NOW())`,
        [ag.barbearia_id, ag.id,
         `Amanhã você tem ${ag.servico_nome} com o barbeiro ${ag.barbeiro_nome}!`]
      );
      await query('UPDATE agendamentos SET lembrete_24h_enviado=TRUE WHERE id=$1', [ag.id]);
    }

    if (rows.length > 0) logger.info(`[CRON] ${rows.length} lembrete(s) de 24h processado(s)`);
  } catch (err) {
    logger.error(`[CRON] verificarLembretes24h: ${err.message}`);
  }
};

/* ─── VERIFICAR ASSINATURAS VENCIDAS ────────────────────────── */
const verificarAssinaturas = async () => {
  try {
    // Marca como vencido
    const { rows: vencidas } = await query(
      `UPDATE assinaturas SET status='vencido'
       WHERE status IN ('ativo','trial')
         AND data_vencimento < CURRENT_DATE
       RETURNING barbearia_id, data_vencimento`,
      []
    );

    for (const a of vencidas) {
      const { rows: [dono] } = await query(
        `SELECT u.email, u.nome FROM usuarios u
         WHERE u.barbearia_id=$1 AND u.role='dono' AND u.ativo=TRUE LIMIT 1`,
        [a.barbearia_id]
      );
      if (dono?.email) {
        await sendAssinaturaVencendo(dono.email, dono.nome, a.data_vencimento);
      }
      logger.warn(`[CRON] Assinatura vencida: barbearia ${a.barbearia_id}`);
    }

    // Aviso 3 dias antes de vencer
    const { rows: aVencer } = await query(
      `SELECT a.barbearia_id, a.data_vencimento
       FROM assinaturas a
       WHERE a.status IN ('ativo','trial')
         AND a.data_vencimento = CURRENT_DATE + INTERVAL '3 days'`,
      []
    );

    for (const a of aVencer) {
      const { rows: [dono] } = await query(
        `SELECT email, nome FROM usuarios WHERE barbearia_id=$1 AND role='dono' LIMIT 1`,
        [a.barbearia_id]
      );
      if (dono?.email) {
        await sendAssinaturaVencendo(dono.email, dono.nome, a.data_vencimento);
        logger.info(`[CRON] Aviso vencimento enviado: ${dono.email}`);
      }
    }
  } catch (err) {
    logger.error(`[CRON] verificarAssinaturas: ${err.message}`);
  }
};

/* ─── REGISTRAR TODOS OS CRONS ──────────────────────────────── */
const iniciarCrons = () => {
  // A cada 5 minutos — verifica lembretes 2h
  cron.schedule('*/5 * * * *', verificarLembretes2h, { timezone: 'America/Manaus' });

  // Diário às 08:00 — verifica lembretes 24h
  cron.schedule('0 8 * * *', verificarLembretes24h, { timezone: 'America/Manaus' });

  // Diário às 06:00 — verifica assinaturas vencidas
  cron.schedule('0 6 * * *', verificarAssinaturas, { timezone: 'America/Manaus' });

  logger.info('[CRON] Jobs registrados: lembretes 2h (*/5min), 24h (08:00), assinaturas (06:00)');
};

module.exports = { iniciarCrons, verificarLembretes2h, verificarAssinaturas };

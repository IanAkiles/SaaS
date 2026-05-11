const express  = require('express');
const router   = express.Router();
const stripe   = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MercadoPagoConfig, Payment, PreApproval } = require('mercadopago');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middlewares/auth');
const logger = require('../utils/logger');
const R = require('../utils/response');

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

/* ═══════════════════════════════════════════════════════
   STRIPE
   ═══════════════════════════════════════════════════════ */

// Criar sessão de checkout Stripe
router.post('/stripe/checkout', authenticate, authorize('dono'), async (req, res, next) => {
  try {
    const { plano } = req.body; // basico | pro
    const priceId = plano === 'pro' ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_BASIC;

    const { rows: [bar] } = await query(
      'SELECT nome, email FROM barbearias WHERE id=$1', [req.user.barbearia_id]
    );

    // Busca ou cria customer no Stripe
    const { rows: [assin] } = await query(
      'SELECT stripe_customer_id FROM assinaturas WHERE barbearia_id=$1', [req.user.barbearia_id]
    );

    let customerId = assin?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: bar.email, name: bar.nome,
        metadata: { barbearia_id: req.user.barbearia_id } });
      customerId = customer.id;
      await query('UPDATE assinaturas SET stripe_customer_id=$1 WHERE barbearia_id=$2',
        [customerId, req.user.barbearia_id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/planos?sucesso=1`,
      cancel_url:  `${process.env.FRONTEND_URL}/planos?cancelado=1`,
      metadata: { barbearia_id: req.user.barbearia_id, plano },
    });

    return R.ok(res, { url: session.url, sessionId: session.id });
  } catch (err) { next(err); }
});

// Webhook Stripe (raw body necessário — configurado no server.js)
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn(`[STRIPE WEBHOOK] Assinatura inválida: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const barbeariaId = session.metadata?.barbearia_id;
        const plano       = session.metadata?.plano || 'basico';
        if (!barbeariaId) break;

        await query(
          `UPDATE assinaturas SET
             status='ativo', plano=$1,
             data_vencimento = CURRENT_DATE + INTERVAL '30 days',
             stripe_sub_id=$2
           WHERE barbearia_id=$3`,
          [plano, session.subscription, barbeariaId]
        );
        await query(
          `INSERT INTO pagamentos (barbearia_id,gateway,gateway_payment_id,gateway_event_id,valor,status,descricao,payload_raw)
           VALUES ($1,'stripe',$2,$3,$4,'approved','Assinatura '||$5,$6)`,
          [barbeariaId, session.payment_intent, event.id,
           (session.amount_total || 0) / 100, plano, JSON.stringify(event.data.object)]
        );
        logger.info(`[STRIPE] Assinatura ativada: ${barbeariaId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object;
        const customerId = inv.customer;
        const { rows } = await query(
          'SELECT barbearia_id FROM assinaturas WHERE stripe_customer_id=$1', [customerId]
        );
        if (rows.length) {
          await query(
            `UPDATE assinaturas SET status='ativo', data_vencimento=CURRENT_DATE + INTERVAL '30 days'
             WHERE barbearia_id=$1`, [rows[0].barbearia_id]
          );
          logger.info(`[STRIPE] Renovação paga: ${rows[0].barbearia_id}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await query(
          `UPDATE assinaturas SET status='cancelado', data_cancelamento=CURRENT_DATE
           WHERE stripe_sub_id=$1`, [sub.id]
        );
        logger.info(`[STRIPE] Assinatura cancelada: ${sub.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const { rows } = await query(
          'SELECT barbearia_id FROM assinaturas WHERE stripe_customer_id=$1', [inv.customer]
        );
        if (rows.length) {
          await query(
            `UPDATE assinaturas SET status='vencido' WHERE barbearia_id=$1`,
            [rows[0].barbearia_id]
          );
          logger.warn(`[STRIPE] Pagamento falhou: ${rows[0].barbearia_id}`);
        }
        break;
      }
    }
  } catch (err) {
    logger.error(`[STRIPE WEBHOOK] Erro ao processar evento ${event.type}: ${err.message}`);
  }

  return res.json({ received: true });
});

/* ═══════════════════════════════════════════════════════
   MERCADO PAGO
   ═══════════════════════════════════════════════════════ */

// Criar preferência de pagamento Mercado Pago
router.post('/mercadopago/checkout', authenticate, authorize('dono'), async (req, res, next) => {
  try {
    const { plano = 'basico' } = req.body;
    const valor = plano === 'pro' ? 99.90 : 49.90;

    const { rows: [bar] } = await query(
      'SELECT nome, email FROM barbearias WHERE id=$1', [req.user.barbearia_id]
    );

    const payment = new Payment(mpClient);
    const pref = await payment.create({
      body: {
        transaction_amount: valor,
        description: `BarberPro Plano ${plano}`,
        payment_method_id: 'pix',
        payer: { email: bar.email, first_name: bar.nome },
        external_reference: JSON.stringify({ barbearia_id: req.user.barbearia_id, plano }),
        notification_url: `${process.env.BACKEND_URL || 'https://api.barberpro.com.br'}/api/pagamentos/mercadopago/webhook`,
      },
    });

    return R.ok(res, {
      payment_id: pref.id,
      qr_code: pref.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: pref.point_of_interaction?.transaction_data?.qr_code_base64,
      valor,
    });
  } catch (err) { next(err); }
});

// Webhook Mercado Pago
router.post('/mercadopago/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment' && data?.id) {
      const payment = new Payment(mpClient);
      const pg = await payment.get({ id: data.id });

      if (pg.status === 'approved') {
        const extRef = JSON.parse(pg.external_reference || '{}');
        const { barbearia_id, plano } = extRef;

        if (barbearia_id) {
          await query(
            `UPDATE assinaturas SET status='ativo', plano=$1, data_vencimento=CURRENT_DATE + INTERVAL '30 days'
             WHERE barbearia_id=$2`,
            [plano || 'basico', barbearia_id]
          );
          await query(
            `INSERT INTO pagamentos (barbearia_id,gateway,gateway_payment_id,gateway_event_id,valor,moeda,status,descricao,payload_raw)
             VALUES ($1,'mercadopago',$2,$3,$4,'BRL','approved','Plano '||$5,$6)
             ON CONFLICT (gateway_payment_id) DO NOTHING`,
            [barbearia_id, String(pg.id), String(data.id),
             pg.transaction_amount, plano||'basico', JSON.stringify(pg)]
          );
          logger.info(`[MP] Pagamento aprovado: ${barbearia_id}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[MP WEBHOOK] ${err.message}`);
  }
  return res.sendStatus(200);
});

module.exports = router;

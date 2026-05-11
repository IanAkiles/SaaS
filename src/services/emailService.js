const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter;
const getTransporter = () => {
  if (!transporter) transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT)||587,
    secure: process.env.SMTP_SECURE==='true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
};

const send = async ({ to, subject, html, text }) => {
  try {
    await getTransporter().sendMail({ from: process.env.EMAIL_FROM||'BarberPro <noreply@barberpro.com.br>', to, subject, html, text });
    logger.info(`[EMAIL] Enviado para ${to}`);
  } catch (err) { logger.error(`[EMAIL] Falha: ${err.message}`); }
};

const base = (content) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;background:#1A1612;color:#F0EBE0;margin:0}.wrap{max-width:520px;margin:40px auto;background:#2C2620;border-radius:12px;overflow:hidden}.hdr{background:#1A1612;padding:24px;text-align:center;border-bottom:2px solid #C9A84C}.hdr h1{color:#C9A84C;margin:0;font-size:22px}.bdy{padding:28px 32px}.bdy p{line-height:1.7;color:#D0C8BC}.btn{display:inline-block;background:#C9A84C;color:#1A1612;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0}.ftr{background:#1A1612;padding:16px;text-align:center;font-size:12px;color:#6A5A4A}.hi{color:#C9A84C;font-weight:bold}</style></head><body><div class="wrap"><div class="hdr"><h1>✂ BarberPro</h1></div><div class="bdy">${content}</div><div class="ftr">BarberPro SaaS</div></div></body></html>`;

const sendResetPassword = (to, nome, token, frontendUrl) => send({
  to, subject: '🔐 Redefinição de senha — BarberPro',
  html: base(`<p>Olá, <span class="hi">${nome}</span>!</p><p>Clique para redefinir sua senha (expira em 1h):</p><a href="${frontendUrl}/reset-password?token=${token}" class="btn">Redefinir senha</a>`),
  text: `${frontendUrl}/reset-password?token=${token}`,
});

const sendBoasVindas = (to, nome) => send({
  to, subject: '🎉 Bem-vindo ao BarberPro!',
  html: base(`<p>Olá, <span class="hi">${nome}</span>! Sua barbearia está pronta. 🚀</p><p>Você tem <strong>7 dias de trial gratuito</strong>.</p><a href="${process.env.FRONTEND_URL}/login" class="btn">Acessar painel</a>`),
  text: `Bem-vindo! Acesse: ${process.env.FRONTEND_URL}/login`,
});

const sendLembrete = (to, nome, servico, dataHora, barbeiro) => send({
  to, subject: `⏰ Lembrete: ${servico} em 2 horas`,
  html: base(`<p>Olá, <span class="hi">${nome}</span>!</p><p>Lembrete: <strong>${servico}</strong> às ${new Date(dataHora).toLocaleString('pt-BR')} com o barbeiro ${barbeiro}.</p>`),
  text: `Lembrete: ${servico} às ${new Date(dataHora).toLocaleString('pt-BR')} com ${barbeiro}`,
});

const sendAssinaturaVencendo = (to, nome, dataVencimento) => send({
  to, subject: '⚠️ Assinatura prestes a vencer — BarberPro',
  html: base(`<p>Olá, <span class="hi">${nome}</span>! Sua assinatura vence em <strong>${new Date(dataVencimento).toLocaleDateString('pt-BR')}</strong>.</p><a href="${process.env.FRONTEND_URL}/planos" class="btn">Renovar</a>`),
  text: `Sua assinatura vence em ${new Date(dataVencimento).toLocaleDateString('pt-BR')}`,
});

module.exports = { send, sendResetPassword, sendBoasVindas, sendLembrete, sendAssinaturaVencendo };

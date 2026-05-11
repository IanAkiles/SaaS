// frontend/src/pages/AssinaturaVencida.jsx
import React, { useState } from 'react';
import { assinatura as assinaturaApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const PLANOS = [
  {
    id: 'basico',
    nome: 'Básico',
    preco: 'R$ 49,90/mês',
    features: ['Agenda completa', 'Até 2 barbeiros', 'Controle de clientes', 'Financeiro básico', 'Notificações'],
  },
  {
    id: 'pro',
    nome: 'Pro',
    preco: 'R$ 99,90/mês',
    destaque: true,
    features: ['Tudo do Básico', 'Barbeiros ilimitados', 'Controle de estoque', 'Exportação Excel/PDF', 'Relatórios avançados', 'Integração WhatsApp (em breve)'],
  },
];

const AssinaturaVencida = () => {
  const { user, logout } = useAuth();
  const [loadingPlano, setLoadingPlano] = useState(null);
  const [gateway, setGateway] = useState('stripe'); // stripe | mercadopago
  const [erro, setErro] = useState('');

  const assinar = async (planoId) => {
    setLoadingPlano(planoId);
    setErro('');
    try {
      let res;
      if (gateway === 'stripe') {
        res = await assinaturaApi.checkoutStripe(planoId);
        if (res.data?.url) window.location.href = res.data.url;
      } else {
        res = await assinaturaApi.checkoutMercadoPago(planoId);
        // Exibe QR Code PIX
        if (res.data?.qr_code) {
          // Em produção, renderiza o QR Code
          alert(`PIX gerado! Cole o código no seu banco:\n\n${res.data.qr_code}`);
        }
      }
    } catch (err) {
      setErro(err.message || 'Erro ao processar pagamento. Tente novamente.');
    } finally {
      setLoadingPlano(null);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#1A1612', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1rem',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ maxWidth: 780, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: 40, marginBottom: '.5rem' }}>✂</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: '#C9A84C', fontSize: 28, margin: 0 }}>
            BarberPro
          </h1>
          <p style={{ color: '#A09080', marginTop: '.5rem' }}>
            Olá, <strong style={{ color: '#F0EBE0' }}>{user?.nome}</strong>! Sua assinatura expirou.
          </p>
          <p style={{ color: '#A09080', fontSize: 14 }}>
            Escolha um plano para continuar usando o sistema.
          </p>
        </div>

        {/* Gateway selector */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '.5rem', marginBottom: '1.5rem' }}>
          {['stripe', 'mercadopago'].map(gw => (
            <button
              key={gw}
              onClick={() => setGateway(gw)}
              style={{
                padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                background: gateway === gw ? '#C9A84C' : 'transparent',
                color: gateway === gw ? '#1A1612' : '#A09080',
                border: gateway === gw ? 'none' : '1px solid #4A4038',
              }}
            >
              {gw === 'stripe' ? '💳 Cartão (Stripe)' : '🟡 PIX (Mercado Pago)'}
            </button>
          ))}
        </div>

        {/* Planos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {PLANOS.map(plano => (
            <div key={plano.id} style={{
              background: '#2C2620',
              border: plano.destaque ? '2px solid #C9A84C' : '1px solid #4A4038',
              borderRadius: 12, padding: '1.5rem',
              position: 'relative',
            }}>
              {plano.destaque && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: '#C9A84C', color: '#1A1612', fontSize: 11, fontWeight: 700,
                  padding: '3px 14px', borderRadius: 99,
                }}>MAIS POPULAR</div>
              )}
              <h2 style={{ color: '#C9A84C', fontFamily: "'Playfair Display', serif", marginBottom: '.25rem' }}>
                {plano.nome}
              </h2>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#F0EBE0', marginBottom: '1rem' }}>
                {plano.preco}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '1.5rem' }}>
                {plano.features.map(f => (
                  <li key={f} style={{ color: '#D0C8BC', fontSize: 14, marginBottom: 8 }}>
                    <span style={{ color: '#C9A84C', marginRight: 8 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => assinar(plano.id)}
                disabled={!!loadingPlano}
                style={{
                  width: '100%', padding: '12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: plano.destaque ? '#C9A84C' : 'transparent',
                  color: plano.destaque ? '#1A1612' : '#C9A84C',
                  border: plano.destaque ? 'none' : '1px solid #C9A84C',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
                  opacity: loadingPlano ? .7 : 1,
                }}
              >
                {loadingPlano === plano.id ? 'Processando...' : `Assinar ${plano.nome}`}
              </button>
            </div>
          ))}
        </div>

        {erro && (
          <div style={{
            marginTop: '1rem', padding: '12px', background: 'rgba(226,75,74,.15)',
            border: '1px solid rgba(226,75,74,.4)', borderRadius: 8,
            color: '#F09595', textAlign: 'center', fontSize: 13,
          }}>
            {erro}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={logout}
            style={{ background: 'none', border: 'none', color: '#6A5A4A', cursor: 'pointer', fontSize: 13 }}
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssinaturaVencida;

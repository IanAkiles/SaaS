// frontend/src/services/api.js
// Substitui completamente o localStorage — todas as chamadas ao backend

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

/* ─── HELPERS ────────────────────────────────────────────────── */
const getToken = () => localStorage.getItem('bp_token');
const setToken = (t) => localStorage.setItem('bp_token', t);
const setRefresh = (t) => localStorage.setItem('bp_refresh', t);
const getRefresh = () => localStorage.getItem('bp_refresh');
const clearTokens = () => { localStorage.removeItem('bp_token'); localStorage.removeItem('bp_refresh'); };

let isRefreshing = false;
let refreshQueue = [];

const processQueue = (error, token = null) => {
  refreshQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
  refreshQueue = [];
};

const request = async (path, options = {}) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Token expirado — tenta refresh automático
  if (res.status === 401 && !path.includes('/auth/')) {
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then(newToken => {
        headers.Authorization = `Bearer ${newToken}`;
        return fetch(`${BASE_URL}${path}`, { ...options, headers });
      }).then(r => r.json());
    }

    isRefreshing = true;
    try {
      const refreshToken = getRefresh();
      if (!refreshToken) throw new Error('Sem refresh token');
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await refreshRes.json();
      if (!data.success) throw new Error('Refresh inválido');
      setToken(data.data.accessToken);
      setRefresh(data.data.refreshToken);
      processQueue(null, data.data.accessToken);
      // Repete a requisição original
      headers.Authorization = `Bearer ${data.data.accessToken}`;
      const retryRes = await fetch(`${BASE_URL}${path}`, { ...options, headers });
      return retryRes.json();
    } catch (err) {
      processQueue(err, null);
      clearTokens();
      window.dispatchEvent(new Event('bp:logout'));
      throw err;
    } finally {
      isRefreshing = false;
    }
  }

  // Assinatura vencida
  if (res.status === 402) {
    const data = await res.json();
    window.dispatchEvent(new CustomEvent('bp:assinatura_vencida', { detail: data }));
    throw new Error(data.message || 'Assinatura vencida');
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Erro na requisição');
  return data;
};

const get    = (path)          => request(path, { method: 'GET' });
const post   = (path, body)    => request(path, { method: 'POST',   body });
const put    = (path, body)    => request(path, { method: 'PUT',    body });
const patch  = (path, body)    => request(path, { method: 'PATCH',  body });
const del    = (path)          => request(path, { method: 'DELETE' });

/* ─── AUTH ───────────────────────────────────────────────────── */
export const auth = {
  register: (data) => post('/auth/register', data).then(r => {
    setToken(r.data.accessToken); setRefresh(r.data.refreshToken); return r;
  }),
  login: (email, senha) => post('/auth/login', { email, senha }).then(r => {
    setToken(r.data.accessToken); setRefresh(r.data.refreshToken); return r;
  }),
  logout: async () => {
    try { await post('/auth/logout', {}); } catch {}
    clearTokens();
  },
  me:             () => get('/auth/me'),
  forgotPassword: (email)              => post('/auth/forgot-password', { email }),
  resetPassword:  (token, nova_senha)  => post('/auth/reset-password', { token, nova_senha }),
};

/* ─── AGENDAMENTOS ───────────────────────────────────────────── */
export const agendamentos = {
  listar:          (params = {}) => get('/agendamentos?' + new URLSearchParams(params)),
  buscar:          (id)          => get(`/agendamentos/${id}`),
  criar:           (data)        => post('/agendamentos', data),
  atualizarStatus: (id, status, motivo) => patch(`/agendamentos/${id}/status`, { status, motivo_cancelamento: motivo }),
  horariosDisponiveis: (barbeiro_id, data, servico_id) =>
    get(`/agendamentos/horarios?barbeiro_id=${barbeiro_id}&data=${data}&servico_id=${servico_id}`),
};

/* ─── CLIENTES ───────────────────────────────────────────────── */
export const clientes = {
  listar:    (busca = '', page = 1) => get(`/clientes?busca=${busca}&page=${page}`),
  buscar:    (id)    => get(`/clientes/${id}`),
  criar:     (data)  => post('/clientes', data),
  atualizar: (id, data) => put(`/clientes/${id}`, data),
  remover:   (id)    => del(`/clientes/${id}`),
};

/* ─── BARBEIROS ──────────────────────────────────────────────── */
export const barbeiros = {
  listar:    ()            => get('/barbeiros'),
  buscar:    (id)          => get(`/barbeiros/${id}`),
  criar:     (data)        => post('/barbeiros', data),
  atualizar: (id, data)    => put(`/barbeiros/${id}`, data),
  remover:   (id)          => del(`/barbeiros/${id}`),
};

/* ─── SERVIÇOS ───────────────────────────────────────────────── */
export const servicos = {
  listar:    ()            => get('/servicos'),
  criar:     (data)        => post('/servicos', data),
  atualizar: (id, data)    => put(`/servicos/${id}`, data),
  remover:   (id)          => del(`/servicos/${id}`),
};

/* ─── ESTOQUE ────────────────────────────────────────────────── */
export const estoque = {
  listar:  ()                             => get('/estoque'),
  criar:   (data)                         => post('/estoque', data),
  ajustar: (id, tipo, quantidade, motivo) => patch(`/estoque/${id}/ajuste`, { tipo, quantidade, motivo }),
  remover: (id)                           => del(`/estoque/${id}`),
};

/* ─── FINANCEIRO ─────────────────────────────────────────────── */
export const financeiro = {
  listar:     (mes, ano, tipo) => get(`/financeiro?mes=${mes}&ano=${ano}${tipo ? `&tipo=${tipo}` : ''}`),
  resumo:     ()               => get('/financeiro/resumo'),
  criar:      (data)           => post('/financeiro', data),
  remover:    (id)             => del(`/financeiro/${id}`),
};

/* ─── NOTIFICAÇÕES ───────────────────────────────────────────── */
export const notificacoes = {
  listar:         () => get('/notificacoes'),
  marcarLida:     (id) => patch(`/notificacoes/${id}`, {}),
  marcarTodasLidas: () => patch('/notificacoes', {}),
};

/* ─── ASSINATURA ─────────────────────────────────────────────── */
export const assinatura = {
  buscar:     () => get('/assinatura'),
  pagamentos: () => get('/assinatura/pagamentos'),
  checkoutStripe:      (plano) => post('/pagamentos/stripe/checkout', { plano }),
  checkoutMercadoPago: (plano) => post('/pagamentos/mercadopago/checkout', { plano }),
};

export default { auth, agendamentos, clientes, barbeiros, servicos, estoque, financeiro, notificacoes, assinatura };

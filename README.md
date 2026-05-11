# ✂ BarberPro — SaaS Completo

Sistema de gestão para barbearias com multi-tenant, assinaturas e pagamentos.

---

## 🗂 Estrutura do projeto

```
barberpro/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js          # Pool PostgreSQL
│   │   ├── controllers/
│   │   │   ├── authController.js    # Register, login, refresh, forgot/reset password
│   │   │   ├── agendamentosController.js
│   │   │   ├── clientesController.js
│   │   │   └── otherControllers.js  # Barbeiros, serviços, estoque, financeiro, notificações
│   │   ├── middlewares/
│   │   │   ├── auth.js              # JWT authenticate, authorize, checkAssinatura
│   │   │   └── validate.js          # Joi validation, sanitização, error handler
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── agendamentos.js
│   │   │   ├── clientes.js
│   │   │   ├── barbeiros.js
│   │   │   ├── servicos.js
│   │   │   ├── estoque.js
│   │   │   ├── financeiro.js
│   │   │   ├── notificacoes.js
│   │   │   ├── assinatura.js
│   │   │   └── pagamentos.js        # Stripe + Mercado Pago webhooks
│   │   ├── services/
│   │   │   ├── emailService.js      # Nodemailer templates
│   │   │   └── cronService.js       # Lembretes 2h/24h + verificação assinaturas
│   │   ├── utils/
│   │   │   ├── jwt.js               # generateTokens, verify
│   │   │   ├── logger.js            # Winston
│   │   │   ├── response.js          # R.ok, R.created, R.notFound...
│   │   │   └── schemas.js           # Joi schemas de validação
│   │   └── server.js                # Entry point Express
│   ├── migrations/
│   │   ├── schema.sql               # Schema PostgreSQL completo
│   │   ├── run.js                   # Executa o schema
│   │   └── seed.js                  # Dados de demonstração
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── services/
│   │   │   └── api.js               # Todas as chamadas à API (substitui localStorage)
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx      # Estado global de autenticação
│   │   └── pages/
│   │       └── AssinaturaVencida.jsx # Tela de pagamento/renovação
│   ├── .env.example
│   └── vercel.json
│
├── render.yaml                       # Deploy backend no Render
└── README.md
```

---

## 🚀 Como rodar localmente

### Pré-requisitos
- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

### 1. Clonar e configurar

```bash
git clone https://github.com/seu-usuario/barberpro.git
cd barberpro
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edite o .env com suas credenciais
```

### 3. Banco de dados

```bash
# Crie o banco
psql -U postgres -c "CREATE DATABASE barberpro;"

# Aplique o schema
npm run migrate

# (Opcional) Insira dados de demonstração
npm run seed
# Login: ze@barberpro.com | Senha: 123456
```

### 4. Iniciar o backend

```bash
npm run dev
# API disponível em http://localhost:3001
# Health check: http://localhost:3001/health
```

### 5. Frontend

```bash
cd ../frontend
npm install         # ou use sua stack (Next.js, Vite, etc.)
cp .env.example .env
# Configure REACT_APP_API_URL=http://localhost:3001/api
npm start
```

---

## 🔌 Endpoints principais

### Auth
| Método | Rota                        | Descrição                |
|--------|-----------------------------|--------------------------|
| POST   | `/api/auth/register`        | Cadastrar barbearia+dono |
| POST   | `/api/auth/login`           | Login                    |
| GET    | `/api/auth/me`              | Dados do usuário logado  |
| POST   | `/api/auth/refresh`         | Renovar tokens JWT       |
| POST   | `/api/auth/forgot-password` | Solicitar reset de senha |
| POST   | `/api/auth/reset-password`  | Redefinir senha          |
| POST   | `/api/auth/logout`          | Logout                   |

### Agendamentos
| Método | Rota                              | Descrição                      |
|--------|-----------------------------------|--------------------------------|
| GET    | `/api/agendamentos`               | Listar (filtros: data, barbeiro)|
| GET    | `/api/agendamentos/horarios`      | Horários disponíveis           |
| GET    | `/api/agendamentos/:id`           | Buscar um                      |
| POST   | `/api/agendamentos`               | Criar (valida conflito)        |
| PATCH  | `/api/agendamentos/:id/status`    | Atualizar status               |

### Demais recursos
Todos seguem o padrão REST:
- `GET    /api/{recurso}`        → Listar
- `GET    /api/{recurso}/:id`    → Buscar
- `POST   /api/{recurso}`        → Criar
- `PUT    /api/{recurso}/:id`    → Atualizar
- `DELETE /api/{recurso}/:id`    → Remover

Recursos: `clientes`, `barbeiros`, `servicos`, `estoque`, `financeiro`, `notificacoes`, `assinatura`

### Pagamentos
| Método | Rota                                    | Descrição              |
|--------|-----------------------------------------|------------------------|
| POST   | `/api/pagamentos/stripe/checkout`       | Criar sessão Stripe    |
| POST   | `/api/pagamentos/stripe/webhook`        | Webhook Stripe         |
| POST   | `/api/pagamentos/mercadopago/checkout`  | Gerar PIX Mercado Pago |
| POST   | `/api/pagamentos/mercadopago/webhook`   | Webhook Mercado Pago   |

---

## 🔒 Multi-tenant e Segurança

- Cada barbearia possui um `barbearia_id` único (UUID)
- **Todos os endpoints** filtram automaticamente por `barbearia_id` do token JWT
- Nenhum usuário pode acessar dados de outra barbearia
- Senhas criptografadas com **bcrypt (12 rounds)**
- **JWT** com access token (7d) + refresh token (30d)
- Rate limiting: 100 req/15min geral, 20 req/15min em `/auth`
- Sanitização de inputs com `xss`
- Validação com **Joi** em todos os endpoints de escrita
- Helmet para headers de segurança

---

## 💳 Sistema de assinaturas

| Status      | Descrição                        | Acesso |
|-------------|----------------------------------|--------|
| `trial`     | Período gratuito de 7 dias       | ✅ Completo |
| `ativo`     | Assinatura paga e válida         | ✅ Completo |
| `vencido`   | Data de vencimento ultrapassada  | ❌ Bloqueado (tela de pagamento) |
| `bloqueado` | Bloqueio manual pelo admin       | ❌ Bloqueado |
| `cancelado` | Assinatura cancelada             | ❌ Bloqueado |

O middleware `checkAssinatura` verifica o status em **cada requisição** e retorna HTTP 402 se vencido.
O frontend detecta o 402 e exibe a `AssinaturaVencida.jsx` automaticamente.

---

## ⏰ Cron Jobs

| Job                   | Frequência       | Ação                                      |
|-----------------------|------------------|-------------------------------------------|
| Lembretes 2h antes    | A cada 5 minutos | Notifica cliente e barbeiro               |
| Lembretes 24h antes   | Diário 08:00     | Aviso do dia seguinte                     |
| Verificar assinaturas | Diário 06:00     | Marca vencidas, envia e-mail de aviso 3d  |

---

## 🌐 Deploy

### Backend → Render
```bash
# 1. Crie conta em render.com
# 2. New > Web Service > conecte o repositório
# 3. O render.yaml já configura tudo automaticamente
# 4. Adicione as variáveis de ambiente secretas no painel
# 5. Após deploy: POST https://api.barberpro.com.br/api/auth/migrate (opcional)
```

### Frontend → Vercel
```bash
npm install -g vercel
cd frontend
vercel --prod
# Configure REACT_APP_API_URL nas environment variables do Vercel
```

### Banco → Neon (recomendado, gratuito)
```
1. Acesse neon.tech
2. Crie um projeto PostgreSQL
3. Copie a connection string
4. Cole em DATABASE_URL no Render
5. Execute: npm run migrate (via Render Shell ou localmente)
```

---

## 📞 Integração WhatsApp (preparado para futuro)

O campo `canal` em `notificacoes` já suporta `whatsapp`.
Para ativar, integre com a **WhatsApp Business API** ou **Evolution API**:

```js
// src/services/whatsappService.js (exemplo futuro)
const enviarWhatsApp = async (numero, mensagem) => {
  await fetch('https://api.z-api.io/instances/SEU_ID/send-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_TOKEN },
    body: JSON.stringify({ phone: numero, message: mensagem }),
  });
};
```

---

## 🧪 Testando a API

```bash
# Health check
curl http://localhost:3001/health

# Registrar barbearia
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nome_barbearia":"Barbearia Teste","nome":"João","email":"joao@teste.com","senha":"123456"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ze@barberpro.com","senha":"123456"}'

# Usar o token retornado:
TOKEN="eyJ..."

# Listar agendamentos de hoje
curl http://localhost:3001/api/agendamentos?data=$(date +%Y-%m-%d) \
  -H "Authorization: Bearer $TOKEN"
```

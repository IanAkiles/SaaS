const Joi = require('joi');

const senhaSchema = Joi.string().min(6).max(100).required().messages({
  'string.min': 'Senha deve ter no mínimo 6 caracteres',
  'any.required': 'Senha é obrigatória',
});

const schemas = {
  register: Joi.object({
    nome_barbearia: Joi.string().min(2).max(120).required(),
    nome:           Joi.string().min(2).max(120).required(),
    email:          Joi.string().email().lowercase().required(),
    senha:          senhaSchema,
    telefone:       Joi.string().max(20).optional().allow(''),
    cidade:         Joi.string().max(80).optional().allow(''),
    estado:         Joi.string().length(2).uppercase().optional().allow(''),
  }),

  login: Joi.object({
    email: Joi.string().email().lowercase().required(),
    senha: Joi.string().required(),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().lowercase().required(),
  }),

  resetPassword: Joi.object({
    token:      Joi.string().required(),
    nova_senha: senhaSchema,
  }),

  refresh: Joi.object({
    refreshToken: Joi.string().required(),
  }),

  agendamento: Joi.object({
    cliente_id:   Joi.string().uuid().required(),
    barbeiro_id:  Joi.string().uuid().required(),
    servico_id:   Joi.string().uuid().required(),
    data_hora:    Joi.date().iso().greater('now').required(),
    observacoes:  Joi.string().max(500).optional().allow(''),
  }),

  cliente: Joi.object({
    nome:            Joi.string().min(2).max(120).required(),
    email:           Joi.string().email().optional().allow(''),
    telefone:        Joi.string().max(20).optional().allow(''),
    whatsapp:        Joi.string().max(20).optional().allow(''),
    data_nascimento: Joi.date().optional().allow(null),
    observacoes:     Joi.string().max(1000).optional().allow(''),
  }),

  servico: Joi.object({
    nome:        Joi.string().min(2).max(120).required(),
    descricao:   Joi.string().max(500).optional().allow(''),
    preco:       Joi.number().min(0).required(),
    duracao_min: Joi.number().integer().min(5).max(480).required(),
    categoria:   Joi.string().max(60).optional().allow(''),
    icone:       Joi.string().max(10).optional().allow(''),
  }),

  barbeiro: Joi.object({
    nome:          Joi.string().min(2).max(120).required(),
    email:         Joi.string().email().optional().allow(''),
    telefone:      Joi.string().max(20).optional().allow(''),
    comissao_pct:  Joi.number().min(0).max(100).optional(),
    especialidades: Joi.array().items(Joi.string()).optional(),
  }),

  financeiro: Joi.object({
    tipo:            Joi.string().valid('receita', 'despesa').required(),
    descricao:       Joi.string().min(2).max(300).required(),
    valor:           Joi.number().min(0.01).required(),
    data:            Joi.date().iso().required(),
    categoria:       Joi.string().max(60).optional().allow(''),
    forma_pagamento: Joi.string().max(30).optional().allow(''),
  }),

  estoque: Joi.object({
    nome:           Joi.string().min(2).max(120).required(),
    categoria:      Joi.string().max(60).optional().allow(''),
    quantidade:     Joi.number().min(0).required(),
    quantidade_min: Joi.number().min(0).required(),
    custo_unitario: Joi.number().min(0).optional(),
    unidade:        Joi.string().max(20).optional().allow(''),
    fornecedor:     Joi.string().max(120).optional().allow(''),
  }),

  ajusteEstoque: Joi.object({
    tipo:       Joi.string().valid('entrada', 'saida', 'ajuste').required(),
    quantidade: Joi.number().min(0).required(),
    motivo:     Joi.string().max(300).optional().allow(''),
  }),
};

module.exports = schemas;

const router = require('express').Router();
const ctrl   = require('../controllers/agendamentosController');
const { authenticate, checkAssinatura, authorize } = require('../middlewares/auth');
const { validate, sanitizeInput } = require('../middlewares/validate');
const S = require('../utils/schemas');

router.use(sanitizeInput, authenticate, checkAssinatura);

// GET /api/agendamentos?data=&barbeiro_id=&status=
router.get('/',             ctrl.listar);

// GET /api/agendamentos/horarios?barbeiro_id=&data=&servico_id=
router.get('/horarios',     ctrl.horariosDisponiveis);

// GET /api/agendamentos/:id
router.get('/:id',          ctrl.buscar);

// POST /api/agendamentos
router.post('/',            validate(S.agendamento), ctrl.criar);

// PATCH /api/agendamentos/:id/status
router.patch('/:id/status', authorize('dono','gerente','barbeiro'), ctrl.atualizarStatus);

module.exports = router;

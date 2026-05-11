const router = require('express').Router();
const { listarServicos, criarServico, atualizarServico, removerServico } = require('../controllers/otherControllers');
const { authenticate, checkAssinatura, authorize } = require('../middlewares/auth');
const { validate, sanitizeInput } = require('../middlewares/validate');
const S = require('../utils/schemas');

router.use(sanitizeInput, authenticate, checkAssinatura);
router.get('/',       listarServicos);
router.post('/',      authorize('dono','gerente'), validate(S.servico), criarServico);
router.put('/:id',    authorize('dono','gerente'), validate(S.servico), atualizarServico);
router.delete('/:id', authorize('dono'),           removerServico);
module.exports = router;

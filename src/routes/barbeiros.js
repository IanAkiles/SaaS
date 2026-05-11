const router = require('express').Router();
const { listarBarbeiros, buscarBarbeiro, criarBarbeiro, atualizarBarbeiro, removerBarbeiro } = require('../controllers/otherControllers');
const { authenticate, checkAssinatura, authorize } = require('../middlewares/auth');
const { validate, sanitizeInput } = require('../middlewares/validate');
const S = require('../utils/schemas');

router.use(sanitizeInput, authenticate, checkAssinatura);
router.get('/',       listarBarbeiros);
router.get('/:id',    buscarBarbeiro);
router.post('/',      authorize('dono','gerente'), validate(S.barbeiro), criarBarbeiro);
router.put('/:id',    authorize('dono','gerente'), validate(S.barbeiro), atualizarBarbeiro);
router.delete('/:id', authorize('dono'),           removerBarbeiro);
module.exports = router;

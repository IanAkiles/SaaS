const router = require('express').Router();
const ctrl   = require('../controllers/clientesController');
const { authenticate, checkAssinatura } = require('../middlewares/auth');
const { validate, sanitizeInput }       = require('../middlewares/validate');
const S = require('../utils/schemas');

router.use(sanitizeInput, authenticate, checkAssinatura);
router.get('/',       ctrl.listar);
router.get('/:id',    ctrl.buscar);
router.post('/',      validate(S.cliente), ctrl.criar);
router.put('/:id',    validate(S.cliente), ctrl.atualizar);
router.delete('/:id', ctrl.remover);
module.exports = router;

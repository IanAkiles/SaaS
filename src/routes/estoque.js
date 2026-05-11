const router = require('express').Router();
const { listarEstoque, criarEstoque, ajustarEstoque, removerEstoque } = require('../controllers/otherControllers');
const { authenticate, checkAssinatura, authorize } = require('../middlewares/auth');
const { validate, sanitizeInput } = require('../middlewares/validate');
const S = require('../utils/schemas');

router.use(sanitizeInput, authenticate, checkAssinatura);
router.get('/',              listarEstoque);
router.post('/',             authorize('dono','gerente'), validate(S.estoque), criarEstoque);
router.patch('/:id/ajuste',  authorize('dono','gerente','barbeiro'), validate(S.ajusteEstoque), ajustarEstoque);
router.delete('/:id',        authorize('dono'), removerEstoque);
module.exports = router;

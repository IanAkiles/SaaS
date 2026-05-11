const router = require('express').Router();
const { listarFinanceiro, criarLancamento, removerLancamento, resumoMensal } = require('../controllers/otherControllers');
const { authenticate, checkAssinatura, authorize } = require('../middlewares/auth');
const { validate, sanitizeInput } = require('../middlewares/validate');
const S = require('../utils/schemas');

router.use(sanitizeInput, authenticate, checkAssinatura);
router.get('/',        listarFinanceiro);
router.get('/resumo',  resumoMensal);
router.post('/',       authorize('dono','gerente'), validate(S.financeiro), criarLancamento);
router.delete('/:id',  authorize('dono','gerente'), removerLancamento);
module.exports = router;
